# db/spend.py — Database operations for spend-based accounting.

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from postgrest.exceptions import APIError

from app.db.client import supabase

logger = logging.getLogger(__name__)

# Fields prefixed with "_" are internal enrichment fields used by the pipeline
# to update spend_transactions after calculation. Strip them before inserting
# into company_emissions.
_INTERNAL_FIELDS = {
    "_spend_category",
    "_sector_code",
    "_spend_factor_id",
    "_factor_value",
    "_usd_amount",
    "_exchange_rate",
    "_classification_confidence",
    "_spend_transaction_id",
}


def _strip_internal_fields(row: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in row.items() if k not in _INTERNAL_FIELDS}


def _build_spend_emissions_insert_candidates(
    rows: List[Dict[str, Any]],
) -> List[List[Dict[str, Any]]]:
    """
    Build insertion candidates in decreasing richness order (mirrors activity emissions logic).

    Attempt 1: full row (richest payload)
    Attempt 2: analytics core subset
    Attempt 3: minimal legacy subset
    """
    ANALYTICS_CORE_FIELDS = {
        "activity_id",
        "emission_factor_id",
        "co2e",
        "organization_id",
        "company_location_id",
        "department_id",
        "supplier_id",
        "emission_category_id",
        "scope",
        "activity_type",
        "category",
        "subcategory",
        "activity_value",
        "activity_date",
        "reporting_year",
        "reporting_month",
        "reporting_quarter",
        "reporting_period",
        "emissions_kgco2e",
        "emissions_tco2e",
        "activity_quantity",
        "activity_unit",
        "calculation_method",
        "calculation_confidence",
        "verification_status",
        "source_system",
        "tags",
        "metadata",
        "calculated_at",
    }
    LEGACY_CORE_FIELDS = {"activity_id", "emission_factor_id", "co2e", "calculated_at"}

    full_rows = [_strip_internal_fields(row) for row in rows]
    analytics_rows = [
        {k: v for k, v in _strip_internal_fields(row).items() if k in ANALYTICS_CORE_FIELDS}
        for row in rows
    ]
    legacy_rows = [
        {k: v for k, v in row.items() if k in LEGACY_CORE_FIELDS}
        for row in rows
    ]
    return [full_rows, analytics_rows, legacy_rows]


def insert_spend_emissions(rows: List[Dict[str, Any]]) -> None:
    """
    Insert spend-based emission rows into company_emissions.

    Uses the same multi-attempt strategy as activity-based emissions to handle
    schema mismatches gracefully.
    """
    if not rows:
        logger.info("[SpendEmissions Insert] No rows to insert")
        return

    logger.info(
        "[SpendEmissions Insert] Inserting %d spend-based emission rows into company_emissions",
        len(rows),
    )

    for attempt_num, candidate_rows in enumerate(
        _build_spend_emissions_insert_candidates(rows), 1
    ):
        try:
            fields_in_attempt = list(candidate_rows[0].keys()) if candidate_rows else []
            logger.info(
                "[SpendEmissions Insert] Attempt %d: %d rows, %d fields: %s",
                attempt_num,
                len(candidate_rows),
                len(fields_in_attempt),
                fields_in_attempt,
            )
            supabase.table("company_emissions").insert(candidate_rows).execute()
            logger.info(
                "[SpendEmissions Insert] ✅ Success on attempt %d", attempt_num
            )
            return
        except APIError as exc:
            logger.warning(
                "[SpendEmissions Insert] Attempt %d failed (APIError): %s",
                attempt_num,
                str(exc),
            )
            continue
        except Exception as exc:
            logger.error(
                "[SpendEmissions Insert] Attempt %d failed (%s): %s",
                attempt_num,
                type(exc).__name__,
                str(exc),
            )
            continue

    raise RuntimeError(
        "Failed to insert spend emission rows into company_emissions after all attempts"
    )


def insert_spend_transactions(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Batch-insert spend transaction records into spend_transactions.

    Returns the inserted rows (with DB-generated IDs).
    """
    if not rows:
        return []

    logger.info(
        "[SpendTransactions Insert] Inserting %d spend transaction rows", len(rows)
    )

    SPEND_TX_FIELDS = {
        "organization_id",
        "company_location_id",
        "department_id",
        "supplier_id",
        "transaction_date",
        "invoice_number",
        "procurement_category",
        "accounting_code",
        "spend_description",
        "amount",
        "currency",
        "quantity",
        "unit",
        "estimated_emissions_kgco2e",
        "source_upload_id",
        "metadata",
        # Extended spend-based fields.
        "spend_category",
        "spend_factor_id",
        "calculation_method",
        "classification_confidence",
        "emissions_factor_value",
        "original_currency_amount",
        "usd_amount",
        "exchange_rate_to_usd",
    }

    payload = [
        {k: v for k, v in row.items() if k in SPEND_TX_FIELDS and v is not None}
        for row in rows
    ]

    try:
        response = supabase.table("spend_transactions").insert(payload).execute()
        if isinstance(response.data, list):
            return [r for r in response.data if isinstance(r, dict)]
    except Exception as exc:
        logger.error(
            "[SpendTransactions Insert] Failed to insert: %s", str(exc)
        )

    return []


def update_spend_transactions_with_emissions(
    transaction_updates: List[Dict[str, Any]],
) -> None:
    """
    Update spend_transactions rows with their calculated emission values.

    Each dict in transaction_updates must have:
        id: str (UUID of the spend_transaction row)
        spend_category: str
        spend_factor_id: str
        calculation_method: str = 'spend_based'
        classification_confidence: float
        emissions_factor_value: float
        original_currency_amount: float
        usd_amount: float
        exchange_rate_to_usd: float
        estimated_emissions_kgco2e: float
    """
    if not transaction_updates:
        return

    UPDATE_FIELDS = {
        "spend_category",
        "spend_factor_id",
        "calculation_method",
        "classification_confidence",
        "emissions_factor_value",
        "original_currency_amount",
        "usd_amount",
        "exchange_rate_to_usd",
        "estimated_emissions_kgco2e",
    }

    success_count = 0
    for update in transaction_updates:
        tx_id = update.get("id")
        if not tx_id:
            continue
        patch = {k: v for k, v in update.items() if k in UPDATE_FIELDS and v is not None}
        if not patch:
            continue
        try:
            supabase.table("spend_transactions").update(patch).eq("id", tx_id).execute()
            success_count += 1
        except Exception as exc:
            logger.warning(
                "[SpendTransactions Update] Failed to update tx %s: %s", tx_id, exc
            )

    logger.info(
        "[SpendTransactions Update] Updated %d/%d spend_transactions with emission data",
        success_count,
        len(transaction_updates),
    )


def get_spend_transactions_for_upload(upload_id: str) -> List[Dict[str, Any]]:
    """Fetch all spend transactions for a given source upload."""
    try:
        response = (
            supabase.table("spend_transactions")
            .select("*")
            .eq("source_upload_id", upload_id)
            .execute()
        )
        if isinstance(response.data, list):
            return [r for r in response.data if isinstance(r, dict)]
    except Exception as exc:
        logger.warning(
            "[SpendTransactions] Failed to fetch transactions for upload %s: %s",
            upload_id,
            exc,
        )
    return []
