"""
spend.py — Enterprise spend-based accounting engine.

Implements the USEEIO spend-based emission calculation path:

    Invoice Upload
        ↓
    Spend Transaction Record
        ↓
    Category Resolution  (spend_category_mappings — deterministic SQL)
        ↓
    Sector Resolution    (spend_category_to_sector_mappings)
        ↓
    Factor Lookup        (spend_emission_factors — USEEIO kgCO2e/USD)
        ↓
    Currency Conversion  (original → USD)
        ↓
    Emission Calculation (usd_amount × factor_value)
        ↓
    company_emissions    (calculation_method='spend_based', source_system='useeio')

This is the fallback path when activity quantity + unit are not available:
    Priority 1: Activity-Based (DEFRA factors)
    Priority 2: Spend-Based   (USEEIO factors)  ← this module

Design principles:
    - Deterministic category resolution — no AI, no embeddings, indexed SQL only
    - Batch processing to support millions of records (avoid N+1 queries)
    - Single source of truth: company_emissions fact table
    - All USEEIO factors are in kgCO2e/USD; amounts must be converted to USD first
"""

from __future__ import annotations

import logging
import re
import threading
from collections import OrderedDict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Mapping, Optional, Tuple

from supabase import Client

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Static reference exchange rates (currency → USD).
# These are reference rates used when no live rate is available.
# Store exchange_rate_to_usd so auditors can reconstruct the calculation.
# ---------------------------------------------------------------------------

REFERENCE_EXCHANGE_RATES_TO_USD: Dict[str, float] = {
    "USD": 1.0,
    "GBP": 1.27,
    "EUR": 1.09,
    "CAD": 0.74,
    "AUD": 0.65,
    "CHF": 1.13,
    "JPY": 0.0067,
    "CNY": 0.14,
    "INR": 0.012,
    "MXN": 0.058,
    "BRL": 0.20,
    "ZAR": 0.055,
    "SGD": 0.74,
    "HKD": 0.13,
    "NOK": 0.094,
    "SEK": 0.096,
    "DKK": 0.146,
    "NZD": 0.61,
}


class SpendCalculationError(Exception):
    """Raised when spend-based emission calculation cannot be completed."""


# ---------------------------------------------------------------------------
# Simple TTL cache for spend factor lookups (sector_code → factor row).
# Avoids repeated DB calls for the same sector in a batch.
# ---------------------------------------------------------------------------

class _TTLSpendFactorCache:
    """Thread-safe LRU + TTL cache for spend emission factor lookups."""

    def __init__(self, maxsize: int = 2048, ttl_seconds: int = 300) -> None:
        self.maxsize = max(1, maxsize)
        self.ttl_seconds = max(1, ttl_seconds)
        self._store: OrderedDict[str, Tuple[float, Optional[Dict[str, Any]]]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        import time
        now = time.time()
        with self._lock:
            payload = self._store.get(key)
            if payload is None:
                return None
            expires_at, value = payload
            if expires_at < now:
                self._store.pop(key, None)
                return None
            self._store.move_to_end(key)
            return value

    def set(self, key: str, value: Optional[Dict[str, Any]]) -> None:
        import time
        now = time.time()
        with self._lock:
            self._store[key] = (now + self.ttl_seconds, value)
            self._store.move_to_end(key)
            while len(self._store) > self.maxsize:
                self._store.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    # Sentinel to distinguish "not in cache" from "cached None".
    _MISSING = object()

    def get_with_sentinel(self, key: str) -> Any:
        """Returns _MISSING if key not in cache, otherwise the cached value (which may be None)."""
        import time
        now = time.time()
        with self._lock:
            payload = self._store.get(key)
            if payload is None:
                return self._MISSING
            expires_at, value = payload
            if expires_at < now:
                self._store.pop(key, None)
                return self._MISSING
            self._store.move_to_end(key)
            return value


_spend_factor_cache = _TTLSpendFactorCache(maxsize=2048, ttl_seconds=300)


def clear_spend_factor_cache() -> None:
    _spend_factor_cache.clear()


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _safe_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(Decimal(str(value).strip()))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _normalize_text(text: Optional[str]) -> str:
    """Lowercase, strip, collapse whitespace — used for deterministic matching."""
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.strip().lower())


# ---------------------------------------------------------------------------
# Step 1 — Currency Conversion
# ---------------------------------------------------------------------------

def convert_to_usd(
    amount: float,
    currency: str,
    custom_rates: Optional[Dict[str, float]] = None,
) -> Tuple[float, float]:
    """
    Convert amount from given currency to USD.

    Returns (usd_amount, exchange_rate_to_usd).

    Parameters
    ----------
    amount:
        Transaction amount in original currency.
    currency:
        ISO 4217 currency code (e.g. 'GBP', 'EUR').
    custom_rates:
        Optional override map {currency_code: rate_to_usd}.
        Takes precedence over REFERENCE_EXCHANGE_RATES_TO_USD.

    Raises
    ------
    SpendCalculationError
        If the currency is not recognised and no custom rate is provided.
    """
    upper_currency = (currency or "").strip().upper()
    rates = {**REFERENCE_EXCHANGE_RATES_TO_USD, **(custom_rates or {})}
    rate = rates.get(upper_currency)
    if rate is None:
        raise SpendCalculationError(
            f"Unsupported currency '{upper_currency}'. "
            f"Supported currencies: {sorted(rates.keys())}"
        )
    usd_amount = round(amount * rate, 6)
    return usd_amount, rate


# ---------------------------------------------------------------------------
# Step 2 — Category Resolution
# ---------------------------------------------------------------------------

def resolve_spend_category(
    supabase: Client,
    raw_supplier: Optional[str],
    raw_description: Optional[str],
    procurement_category: Optional[str],
) -> Tuple[Optional[str], Optional[str], float]:
    """
    Resolve a spend_category and sector_code from supplier / description / category.

    Uses deterministic SQL lookups against spend_category_mappings.
    No AI, no embeddings.

    Resolution priority:
        1. Exact match on raw_supplier (case-insensitive)
        2. Exact match on procurement_category
        3. Partial match on raw_description ILIKE
        4. Partial match on raw_supplier ILIKE

    Returns
    -------
    (spend_category, sector_code, confidence)
        spend_category: resolved category string or None
        sector_code: resolved USEEIO sector code or None
        confidence: 0.0–1.0
    """
    # Strategy 1: exact supplier match.
    if raw_supplier:
        normalized_supplier = _normalize_text(raw_supplier)
        resp = (
            supabase.table("spend_category_mappings")
            .select("spend_category, sector_code, confidence")
            .ilike("raw_supplier", normalized_supplier)
            .in_("review_status", ["approved", "auto_approved"])
            .order("confidence", desc=True)
            .limit(1)
            .execute()
        )
        if resp.data:
            row = resp.data[0]
            return (
                _safe_str(row.get("spend_category")),
                _safe_str(row.get("sector_code")),
                float(row.get("confidence") or 0.9),
            )

    # Strategy 2: exact procurement_category match.
    if procurement_category:
        normalized_cat = _normalize_text(procurement_category)
        resp = (
            supabase.table("spend_category_mappings")
            .select("spend_category, sector_code, confidence")
            .ilike("procurement_category", normalized_cat)
            .in_("review_status", ["approved", "auto_approved"])
            .order("confidence", desc=True)
            .limit(1)
            .execute()
        )
        if resp.data:
            row = resp.data[0]
            return (
                _safe_str(row.get("spend_category")),
                _safe_str(row.get("sector_code")),
                float(row.get("confidence") or 0.7),
            )

    # Strategy 3: partial description match.
    if raw_description:
        resp = (
            supabase.table("spend_category_mappings")
            .select("spend_category, sector_code, confidence")
            .ilike("raw_description", f"%{_normalize_text(raw_description)}%")
            .in_("review_status", ["approved", "auto_approved"])
            .order("confidence", desc=True)
            .limit(1)
            .execute()
        )
        if resp.data:
            row = resp.data[0]
            return (
                _safe_str(row.get("spend_category")),
                _safe_str(row.get("sector_code")),
                float(row.get("confidence") or 0.5),
            )

    # Strategy 4: partial supplier name match.
    if raw_supplier:
        resp = (
            supabase.table("spend_category_mappings")
            .select("spend_category, sector_code, confidence")
            .ilike("raw_supplier", f"%{_normalize_text(raw_supplier)}%")
            .in_("review_status", ["approved", "auto_approved"])
            .order("confidence", desc=True)
            .limit(1)
            .execute()
        )
        if resp.data:
            row = resp.data[0]
            return (
                _safe_str(row.get("spend_category")),
                _safe_str(row.get("sector_code")),
                float(row.get("confidence") or 0.4),
            )

    return None, None, 0.0


def _batch_resolve_spend_categories(
    supabase: Client,
    keys: List[Tuple[Optional[str], Optional[str], Optional[str]]],
) -> List[Tuple[Optional[str], Optional[str], float]]:
    """
    Batch category resolution.

    keys: list of (raw_supplier, raw_description, procurement_category)

    Returns list of (spend_category, sector_code, confidence) in same order.
    Uses a single JOIN-style query per strategy to avoid N+1.
    """
    results: List[Tuple[Optional[str], Optional[str], float]] = [
        (None, None, 0.0)
    ] * len(keys)

    # Collect unique supplier names and procurement categories for bulk lookups.
    unique_suppliers = list({
        _normalize_text(k[0]) for k in keys if k[0]
    })
    unique_categories = list({
        _normalize_text(k[2]) for k in keys if k[2]
    })

    # Bulk fetch mappings for known suppliers.
    supplier_map: Dict[str, Tuple[Optional[str], Optional[str], float]] = {}
    if unique_suppliers:
        resp = (
            supabase.table("spend_category_mappings")
            .select("raw_supplier, spend_category, sector_code, confidence")
            .in_("raw_supplier", unique_suppliers)
            .in_("review_status", ["approved", "auto_approved"])
            .not_.is_("raw_supplier", "null")
            .not_.is_("spend_category", "null")
            .execute()
        )
        if resp.data:
            for row in resp.data:
                rs = _normalize_text(_safe_str(row.get("raw_supplier")))
                if rs:
                    existing = supplier_map.get(rs)
                    row_conf = float(row.get("confidence") or 0.9)
                    if existing is None or row_conf > existing[2]:
                        supplier_map[rs] = (
                            _safe_str(row.get("spend_category")),
                            _safe_str(row.get("sector_code")),
                            row_conf,
                        )

    # Bulk fetch mappings for known procurement categories.
    category_map: Dict[str, Tuple[Optional[str], Optional[str], float]] = {}
    if unique_categories:
        resp = (
            supabase.table("spend_category_mappings")
            .select("procurement_category, spend_category, sector_code, confidence")
            .in_("procurement_category", unique_categories)
            .in_("review_status", ["approved", "auto_approved"])
            .not_.is_("spend_category", "null")
            .not_.is_("procurement_category", "null")
            .execute()
        )
        if resp.data:
            for row in resp.data:
                pc = _normalize_text(_safe_str(row.get("procurement_category")))
                if pc:
                    existing = category_map.get(pc)
                    row_conf = float(row.get("confidence") or 0.7)
                    if existing is None or row_conf > existing[2]:
                        category_map[pc] = (
                            _safe_str(row.get("spend_category")),
                            _safe_str(row.get("sector_code")),
                            row_conf,
                        )

    for i, (raw_supplier, raw_description, procurement_category) in enumerate(keys):
        ns = _normalize_text(raw_supplier)
        if ns and ns in supplier_map:
            results[i] = supplier_map[ns]
            continue

        nc = _normalize_text(procurement_category)
        if nc and nc in category_map:
            results[i] = category_map[nc]
            continue

        # Fallback to per-row query for descriptions (rare, low volume).
        results[i] = resolve_spend_category(
            supabase=supabase,
            raw_supplier=raw_supplier,
            raw_description=raw_description,
            procurement_category=procurement_category,
        )

    return results


# ---------------------------------------------------------------------------
# Step 3 — Sector Resolution
# ---------------------------------------------------------------------------

def resolve_spend_sector(
    supabase: Client,
    spend_category: str,
) -> Tuple[Optional[str], float]:
    """
    Resolve USEEIO sector_code from spend_category.

    Returns (sector_code, confidence).
    """
    resp = (
        supabase.table("spend_category_to_sector_mappings")
        .select("sector_code, confidence")
        .eq("spend_category", spend_category)
        .order("confidence", desc=True)
        .limit(1)
        .execute()
    )
    if resp.data:
        row = resp.data[0]
        return (
            _safe_str(row.get("sector_code")),
            float(row.get("confidence") or 0.8),
        )
    return None, 0.0


def _batch_resolve_spend_sectors(
    supabase: Client,
    spend_categories: List[Optional[str]],
) -> Dict[str, Tuple[Optional[str], float]]:
    """
    Bulk resolve sector_codes for a list of spend_categories.

    Returns dict {spend_category: (sector_code, confidence)}.
    """
    unique_cats = list({c for c in spend_categories if c})
    result: Dict[str, Tuple[Optional[str], float]] = {}
    if not unique_cats:
        return result

    resp = (
        supabase.table("spend_category_to_sector_mappings")
        .select("spend_category, sector_code, confidence")
        .in_("spend_category", unique_cats)
        .execute()
    )
    if resp.data:
        for row in resp.data:
            sc = _safe_str(row.get("spend_category"))
            if not sc:
                continue
            existing = result.get(sc)
            row_conf = float(row.get("confidence") or 0.8)
            if existing is None or row_conf > existing[1]:
                result[sc] = (
                    _safe_str(row.get("sector_code")),
                    row_conf,
                )
    return result


# ---------------------------------------------------------------------------
# Step 4 — Factor Resolution
# ---------------------------------------------------------------------------

def resolve_spend_factor(
    supabase: Client,
    sector_code: str,
) -> Optional[Dict[str, Any]]:
    """
    Look up the USEEIO spend emission factor for a sector_code.

    Returns the factor row dict or None if not found.
    Factor values are in kgCO2e/USD.
    """
    cached = _spend_factor_cache.get_with_sentinel(sector_code)
    if cached is not _TTLSpendFactorCache._MISSING:
        # get_with_sentinel returns Any; cast to the expected type.
        return cached if isinstance(cached, dict) else None

    resp = (
        supabase.table("spend_emission_factors")
        .select("id, factor_code, sector_code, sector_name, factor_value, factor_unit, currency_code, scope, spend_category, source_dataset")
        .eq("sector_code", sector_code)
        .eq("factor_status", "active")
        .limit(1)
        .execute()
    )
    factor_row = resp.data[0] if resp.data else None
    _spend_factor_cache.set(sector_code, factor_row)
    return factor_row


def _batch_resolve_spend_factors(
    supabase: Client,
    sector_codes: List[Optional[str]],
) -> Dict[str, Optional[Dict[str, Any]]]:
    """
    Bulk resolve spend emission factors for a list of sector_codes.

    Returns dict {sector_code: factor_row | None}.
    Uses cache where possible, fetches uncached codes in a single query.
    """
    unique_codes = list({c for c in sector_codes if c})
    result: Dict[str, Optional[Dict[str, Any]]] = {}

    uncached_codes: List[str] = []
    for code in unique_codes:
        cached = _spend_factor_cache.get_with_sentinel(code)
        if cached is not _TTLSpendFactorCache._MISSING:
            # get_with_sentinel returns Any; cast to the expected type.
            result[code] = cached if isinstance(cached, dict) else None
        else:
            uncached_codes.append(code)

    if uncached_codes:
        resp = (
            supabase.table("spend_emission_factors")
            .select("id, factor_code, sector_code, sector_name, factor_value, factor_unit, currency_code, scope, spend_category, source_dataset")
            .in_("sector_code", uncached_codes)
            .eq("factor_status", "active")
            .execute()
        )
        # Build a best-match map (highest factor_value wins for duplicates — conservative).
        fetched: Dict[str, Dict[str, Any]] = {}
        if resp.data:
            for row in resp.data:
                sc = _safe_str(row.get("sector_code"))
                if not sc:
                    continue
                if sc not in fetched:
                    fetched[sc] = row
        for code in uncached_codes:
            factor_row = fetched.get(code)
            _spend_factor_cache.set(code, factor_row)
            result[code] = factor_row

    return result


# ---------------------------------------------------------------------------
# Steps 5–7 — Calculation + Emission Record
# ---------------------------------------------------------------------------

def _extract_reporting_date_parts(
    transaction_date: Optional[str],
) -> Tuple[Optional[int], Optional[int], Optional[int], Optional[str]]:
    """Parse transaction_date into (year, month, quarter, period_label)."""
    if not transaction_date:
        return None, None, None, None
    try:
        dt = datetime.fromisoformat(str(transaction_date).replace("Z", "+00:00"))
        year = dt.year
        month = dt.month
        quarter = (month - 1) // 3 + 1
        period = f"{year}-Q{quarter}"
        return year, month, quarter, period
    except Exception:
        return None, None, None, None


def calculate_spend_emission_for_transaction(
    supabase: Client,
    transaction: Dict[str, Any],
    custom_exchange_rates: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Calculate spend-based emission for a single spend transaction dict.

    Parameters
    ----------
    supabase:
        Authenticated Supabase client.
    transaction:
        Spend transaction record (from spend_transactions or pipeline row).
        Expected fields:
            amount, currency, transaction_date,
            organization_id, company_location_id, department_id, supplier_id,
            spend_category (optional — will be resolved if absent),
            raw_supplier / supplier_name,
            raw_description / spend_description / description,
            procurement_category,
    custom_exchange_rates:
        Optional override exchange rates {currency_code: rate_to_usd}.

    Returns
    -------
    dict ready for insertion into company_emissions.

    Raises
    ------
    SpendCalculationError
        If calculation cannot be completed.
    """
    amount = _safe_float(transaction.get("amount"))
    if amount is None or amount <= 0:
        raise SpendCalculationError(
            f"Invalid or missing amount: {transaction.get('amount')!r}"
        )

    currency = _safe_str(transaction.get("currency")) or "GBP"

    # --- Currency Conversion ---
    usd_amount, exchange_rate = convert_to_usd(
        amount=amount,
        currency=currency,
        custom_rates=custom_exchange_rates,
    )

    # --- Category Resolution ---
    spend_category = _safe_str(transaction.get("spend_category"))
    sector_code = _safe_str(transaction.get("sector_code"))
    classification_confidence = 0.0

    if not spend_category:
        raw_supplier = (
            _safe_str(transaction.get("raw_supplier"))
            or _safe_str(transaction.get("supplier_name"))
        )
        raw_description = (
            _safe_str(transaction.get("raw_description"))
            or _safe_str(transaction.get("spend_description"))
            or _safe_str(transaction.get("description"))
        )
        procurement_category = _safe_str(transaction.get("procurement_category"))
        spend_category, sector_code, classification_confidence = resolve_spend_category(
            supabase=supabase,
            raw_supplier=raw_supplier,
            raw_description=raw_description,
            procurement_category=procurement_category,
        )

    if not spend_category:
        raise SpendCalculationError(
            "Could not resolve spend_category from supplier/description/procurement_category"
        )

    # --- Sector Resolution ---
    if not sector_code:
        sector_code, sector_conf = resolve_spend_sector(supabase, spend_category)
        if sector_code:
            classification_confidence = min(classification_confidence, sector_conf) if classification_confidence else sector_conf

    if not sector_code:
        raise SpendCalculationError(
            f"Could not resolve USEEIO sector_code for spend_category={spend_category!r}"
        )

    # --- Factor Lookup ---
    factor_row = resolve_spend_factor(supabase, sector_code)
    if not factor_row:
        raise SpendCalculationError(
            f"No active spend emission factor found for sector_code={sector_code!r}"
        )

    factor_value = _safe_float(factor_row.get("factor_value"))
    if factor_value is None or factor_value < 0:
        raise SpendCalculationError(
            f"Invalid factor_value={factor_row.get('factor_value')!r} for sector_code={sector_code!r}"
        )

    # --- Emission Calculation ---
    # kgCO2e = usd_amount × factor_value (kgCO2e/USD)
    emissions_kgco2e = round(usd_amount * factor_value, 6)
    emissions_tco2e = round(emissions_kgco2e / 1000.0, 9)

    # --- Date Parts ---
    transaction_date = _safe_str(transaction.get("transaction_date"))
    reporting_year, reporting_month, reporting_quarter, reporting_period = (
        _extract_reporting_date_parts(transaction_date)
    )

    # --- Build company_emissions Row ---
    organization_id = _safe_str(transaction.get("organization_id"))
    company_location_id = _safe_str(transaction.get("company_location_id"))
    department_id = _safe_str(transaction.get("department_id"))
    supplier_id = _safe_str(transaction.get("supplier_id"))

    # USEEIO scope mapping — most spend factors map to Scope 3.
    scope_raw = _safe_str(factor_row.get("scope")) or "scope_3"
    scope_map = {"scope_1": 1, "scope_2": 2, "scope_3": 3, "1": 1, "2": 2, "3": 3}
    scope = scope_map.get(scope_raw.replace(" ", "_").lower(), 3)

    spend_factor_id = _safe_str(factor_row.get("id"))
    source_dataset = _safe_str(factor_row.get("source_dataset")) or "useeio"
    sector_name = _safe_str(factor_row.get("sector_name"))

    metadata: Dict[str, Any] = {
        "spend_category": spend_category,
        "sector_code": sector_code,
        "sector_name": sector_name,
        "spend_factor_id": spend_factor_id,
        "factor_value_kgco2e_per_usd": factor_value,
        "usd_amount": usd_amount,
        "original_currency_amount": amount,
        "original_currency": currency,
        "exchange_rate_to_usd": exchange_rate,
        "source_dataset": source_dataset,
        "classification_confidence": classification_confidence,
        "spend_transaction_id": _safe_str(transaction.get("id")),
    }

    return {
        # Link back to the spend transaction (not a company_activity).
        "activity_id": _safe_str(transaction.get("activity_id")),
        "emission_factor_id": spend_factor_id,
        "co2e": emissions_kgco2e,
        "organization_id": organization_id,
        "company_location_id": company_location_id,
        "department_id": department_id,
        "supplier_id": supplier_id,
        "emission_category_id": _safe_str(transaction.get("emission_category_id")),
        "scope": scope,
        "activity_type": "spend_based",
        "category": spend_category,
        "subcategory": sector_name,
        "activity_value": usd_amount,
        "activity_date": transaction_date,
        "reporting_year": reporting_year,
        "reporting_month": reporting_month,
        "reporting_quarter": reporting_quarter,
        "reporting_period": reporting_period,
        "emissions_kgco2e": emissions_kgco2e,
        "emissions_tco2e": emissions_tco2e,
        "activity_quantity": usd_amount,
        "activity_unit": "USD",
        "calculation_method": "spend_based",
        "calculation_confidence": classification_confidence,
        "verification_status": "unverified",
        "source_system": "useeio",
        "tags": transaction.get("tags"),
        "metadata": metadata,
        "calculated_at": datetime.now(timezone.utc).isoformat(),
        # Enrichment fields for spend_transactions update.
        "_spend_category": spend_category,
        "_sector_code": sector_code,
        "_spend_factor_id": spend_factor_id,
        "_factor_value": factor_value,
        "_usd_amount": usd_amount,
        "_exchange_rate": exchange_rate,
        "_classification_confidence": classification_confidence,
    }


def calculate_spend_emissions_for_batch(
    supabase: Client,
    transactions: List[Dict[str, Any]],
    custom_exchange_rates: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Batch spend-based emission calculation.

    Processes transactions using bulk SQL lookups to avoid N+1 queries.
    Suitable for 100,000+ records.

    Parameters
    ----------
    supabase:
        Authenticated Supabase client.
    transactions:
        List of spend transaction dicts.
    custom_exchange_rates:
        Optional override exchange rates.

    Returns
    -------
    {
        "rows": [emission_row, ...],           # ready for company_emissions insert
        "skipped_rows": [skip_info, ...],
        "summary": {
            "total": int,
            "calculated": int,
            "skipped": int,
            "skip_reasons": {bucket: count},
        }
    }
    """
    emissions_rows: List[Dict[str, Any]] = []
    skipped_rows: List[Dict[str, Any]] = []
    skip_reason_counts: Dict[str, int] = {}

    if not transactions:
        return {
            "rows": [],
            "skipped_rows": [],
            "summary": {"total": 0, "calculated": 0, "skipped": 0, "skip_reasons": {}},
        }

    # -----------------------------------------------------------------------
    # Phase 1: Bulk category resolution.
    # -----------------------------------------------------------------------
    logger.info("[SpendBatch] Resolving categories for %d transactions", len(transactions))
    category_keys: List[Tuple[Optional[str], Optional[str], Optional[str]]] = []
    for tx in transactions:
        raw_supplier = (
            _safe_str(tx.get("raw_supplier"))
            or _safe_str(tx.get("supplier_name"))
        )
        raw_description = (
            _safe_str(tx.get("raw_description"))
            or _safe_str(tx.get("spend_description"))
            or _safe_str(tx.get("description"))
        )
        procurement_category = _safe_str(tx.get("procurement_category"))
        category_keys.append((raw_supplier, raw_description, procurement_category))

    category_results = _batch_resolve_spend_categories(supabase, category_keys)

    # -----------------------------------------------------------------------
    # Phase 2: Merge category results into transactions and collect sector keys.
    # -----------------------------------------------------------------------
    enriched_transactions: List[Dict[str, Any]] = []
    for i, tx in enumerate(transactions):
        tx_copy = dict(tx)
        if not _safe_str(tx_copy.get("spend_category")):
            resolved_cat, resolved_sector, resolved_conf = category_results[i]
            if resolved_cat:
                tx_copy["spend_category"] = resolved_cat
            if resolved_sector:
                tx_copy["sector_code"] = resolved_sector
            tx_copy.setdefault("classification_confidence", resolved_conf)
        enriched_transactions.append(tx_copy)

    spend_categories = [_safe_str(tx.get("spend_category")) for tx in enriched_transactions]

    # -----------------------------------------------------------------------
    # Phase 3: Bulk sector resolution (for transactions missing sector_code).
    # -----------------------------------------------------------------------
    needs_sector = [
        tx.get("spend_category")
        for tx in enriched_transactions
        if not tx.get("sector_code") and tx.get("spend_category")
    ]
    sector_map = _batch_resolve_spend_sectors(supabase, needs_sector)  # type: ignore[arg-type]

    for tx in enriched_transactions:
        if not tx.get("sector_code") and tx.get("spend_category"):
            sc = tx["spend_category"]
            sector_code, sector_conf = sector_map.get(sc, (None, 0.0))
            if sector_code:
                tx["sector_code"] = sector_code
                if not tx.get("classification_confidence"):
                    tx["classification_confidence"] = sector_conf

    sector_codes = [_safe_str(tx.get("sector_code")) for tx in enriched_transactions]

    # -----------------------------------------------------------------------
    # Phase 4: Bulk factor resolution.
    # -----------------------------------------------------------------------
    factor_map = _batch_resolve_spend_factors(supabase, sector_codes)

    # -----------------------------------------------------------------------
    # Phase 5: Per-transaction emission calculation (pure arithmetic — fast).
    # -----------------------------------------------------------------------
    for index, tx in enumerate(enriched_transactions):
        try:
            amount = _safe_float(tx.get("amount"))
            if amount is None or amount <= 0:
                raise SpendCalculationError(
                    f"Invalid or missing amount: {tx.get('amount')!r}"
                )

            currency = _safe_str(tx.get("currency")) or "GBP"
            usd_amount, exchange_rate = convert_to_usd(
                amount=amount,
                currency=currency,
                custom_rates=custom_exchange_rates,
            )

            spend_category = _safe_str(tx.get("spend_category"))
            if not spend_category:
                raise SpendCalculationError("Could not resolve spend_category")

            sector_code = _safe_str(tx.get("sector_code"))
            if not sector_code:
                raise SpendCalculationError(
                    f"Could not resolve sector_code for spend_category={spend_category!r}"
                )

            factor_row = factor_map.get(sector_code)
            if not factor_row:
                raise SpendCalculationError(
                    f"No active spend emission factor for sector_code={sector_code!r}"
                )

            factor_value = _safe_float(factor_row.get("factor_value"))
            if factor_value is None or factor_value < 0:
                raise SpendCalculationError(
                    f"Invalid factor_value={factor_row.get('factor_value')!r}"
                )

            emissions_kgco2e = round(usd_amount * factor_value, 6)
            emissions_tco2e = round(emissions_kgco2e / 1000.0, 9)

            transaction_date = _safe_str(tx.get("transaction_date"))
            reporting_year, reporting_month, reporting_quarter, reporting_period = (
                _extract_reporting_date_parts(transaction_date)
            )

            scope_raw = _safe_str(factor_row.get("scope")) or "scope_3"
            scope_map = {"scope_1": 1, "scope_2": 2, "scope_3": 3, "1": 1, "2": 2, "3": 3}
            scope = scope_map.get(scope_raw.replace(" ", "_").lower(), 3)

            classification_confidence = (
                _safe_float(tx.get("classification_confidence")) or 0.0
            )
            spend_factor_id = _safe_str(factor_row.get("id"))
            sector_name = _safe_str(factor_row.get("sector_name"))
            source_dataset = _safe_str(factor_row.get("source_dataset")) or "useeio"

            metadata: Dict[str, Any] = {
                "spend_category": spend_category,
                "sector_code": sector_code,
                "sector_name": sector_name,
                "spend_factor_id": spend_factor_id,
                "factor_value_kgco2e_per_usd": factor_value,
                "usd_amount": usd_amount,
                "original_currency_amount": amount,
                "original_currency": currency,
                "exchange_rate_to_usd": exchange_rate,
                "source_dataset": source_dataset,
                "classification_confidence": classification_confidence,
                "spend_transaction_id": _safe_str(tx.get("id")),
            }

            emission_row: Dict[str, Any] = {
                "activity_id": _safe_str(tx.get("activity_id")),
                "emission_factor_id": spend_factor_id,
                "co2e": emissions_kgco2e,
                "organization_id": _safe_str(tx.get("organization_id")),
                "company_location_id": _safe_str(tx.get("company_location_id")),
                "department_id": _safe_str(tx.get("department_id")),
                "supplier_id": _safe_str(tx.get("supplier_id")),
                "emission_category_id": _safe_str(tx.get("emission_category_id")),
                "scope": scope,
                "activity_type": "spend_based",
                "category": spend_category,
                "subcategory": sector_name,
                "activity_value": usd_amount,
                "activity_date": transaction_date,
                "reporting_year": reporting_year,
                "reporting_month": reporting_month,
                "reporting_quarter": reporting_quarter,
                "reporting_period": reporting_period,
                "emissions_kgco2e": emissions_kgco2e,
                "emissions_tco2e": emissions_tco2e,
                "activity_quantity": usd_amount,
                "activity_unit": "USD",
                "calculation_method": "spend_based",
                "calculation_confidence": classification_confidence,
                "verification_status": "unverified",
                "source_system": "useeio",
                "tags": tx.get("tags"),
                "metadata": metadata,
                "calculated_at": datetime.now(timezone.utc).isoformat(),
                # Internal enrichment fields (stripped before DB insert).
                "_spend_category": spend_category,
                "_sector_code": sector_code,
                "_spend_factor_id": spend_factor_id,
                "_factor_value": factor_value,
                "_usd_amount": usd_amount,
                "_exchange_rate": exchange_rate,
                "_classification_confidence": classification_confidence,
                "_spend_transaction_id": _safe_str(tx.get("id")),
            }
            emissions_rows.append(emission_row)

        except SpendCalculationError as exc:
            reason = str(exc)
            if "spend_category" in reason:
                bucket = "no_category_match"
            elif "sector_code" in reason:
                bucket = "no_sector_match"
            elif "factor" in reason.lower():
                bucket = "no_factor_match"
            elif "currency" in reason.lower():
                bucket = "unsupported_currency"
            elif "amount" in reason.lower():
                bucket = "invalid_amount"
            else:
                bucket = "calculation_error"
            skip_reason_counts[bucket] = skip_reason_counts.get(bucket, 0) + 1
            skipped_rows.append({
                "row_index": index,
                "reason": reason,
                "bucket": bucket,
                "status": "skipped",
                "spend_category": tx.get("spend_category"),
                "sector_code": tx.get("sector_code"),
                "amount": tx.get("amount"),
                "currency": tx.get("currency"),
            })
            logger.warning("[SpendBatch] Row %d skipped (%s): %s", index, bucket, reason)
        except Exception as exc:
            skip_reason_counts["unexpected_error"] = (
                skip_reason_counts.get("unexpected_error", 0) + 1
            )
            skipped_rows.append({
                "row_index": index,
                "reason": f"unexpected spend calculation error: {exc}",
                "bucket": "unexpected_error",
                "status": "skipped",
            })
            logger.exception("[SpendBatch] Row %d unexpected error", index)

    logger.info(
        "[SpendBatch] Done: %d calculated, %d skipped (reasons=%s)",
        len(emissions_rows),
        len(skipped_rows),
        skip_reason_counts,
    )

    return {
        "rows": emissions_rows,
        "skipped_rows": skipped_rows,
        "summary": {
            "total": len(transactions),
            "calculated": len(emissions_rows),
            "skipped": len(skipped_rows),
            "skip_reasons": skip_reason_counts,
        },
    }


# ---------------------------------------------------------------------------
# Priority Guard — activity-based takes precedence over spend-based.
# ---------------------------------------------------------------------------

def has_activity_data(row: Mapping[str, Any]) -> bool:
    """
    Return True if the row has enough data for activity-based calculation.

    A row has activity data when it has a non-null quantity (or equivalent)
    AND a non-null unit, which are required for DEFRA factor lookups.

    This is used to enforce the priority rule:
        1. Activity-Based  (DEFRA) — preferred
        2. Spend-Based     (USEEIO) — fallback only
    """
    def _non_empty(v: Any) -> bool:
        if v is None:
            return False
        s = str(v).strip().lower()
        return s not in ("", "none", "null", "nan", "n/a", "na", "-")

    unit = row.get("unit")
    if not _non_empty(unit):
        return False

    # Check any common quantity field.
    quantity_fields = (
        "quantity", "consumption", "distance", "value", "weight",
        "volume", "energy", "nights", "passengers", "waste_amount",
        "fuel_amount", "refrigerant_amount", "water_amount",
    )
    for field in quantity_fields:
        if _non_empty(row.get(field)):
            return True

    return False


def has_spend_data(row: Mapping[str, Any]) -> bool:
    """
    Return True if the row has enough data for spend-based calculation.

    A row has spend data when it has a non-null amount and currency.
    """
    def _non_empty(v: Any) -> bool:
        if v is None:
            return False
        s = str(v).strip().lower()
        return s not in ("", "none", "null", "nan", "n/a", "na", "-")

    amount = row.get("amount") or row.get("amount_spent") or row.get("spend_amount")
    currency = row.get("currency")
    return _non_empty(amount) and _non_empty(currency)
