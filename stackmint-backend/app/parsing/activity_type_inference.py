from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, Mapping, Optional
import re

from app.parsing.schemas import SCHEMAS
from app.parsing.mapping import COLUMN_ALIASES, LEGACY_ACTIVITY_ALIAS_FALLBACKS


ENTERPRISE_HEADER_HINTS: Dict[str, tuple[str, ...]] = {
    "stationary_combustion": (
        "boiler_id",
        "generator_id",
        "gas_usage",
        "therms_used",
        "m3_used",
        "natural_gas",
        "fuel_oil",
        "site_name",
    ),
    "mobile_combustion": (
        "vehicle_registration",
        "fleet_id",
        "fuel_card",
        "odometer",
        "diesel_liters",
        "petrol_liters",
        "mileage",
        "trip_distance",
    ),
    "fugitive_emissions": (
        "refrigerant_type",
        "gas_charge",
        "leakage_rate",
        "hvac_unit",
        "top_up_amount",
    ),
    "purchased_electricity": (
        "meter_number",
        "billing_period_start",
        "billing_period_end",
        "electricity_consumption",
        "kwh_used",
        "utility_supplier",
        "tariff",
        "grid_region",
    ),
    "purchased_steam": (
        "steam_volume",
        "steam_supplier",
        "district_energy",
        "billing_period",
    ),
    "purchased_heating": (
        "heating_usage",
        "district_heating",
        "heat_meter",
        "heating_supplier",
    ),
    "purchased_cooling": (
        "cooling_usage",
        "district_cooling",
        "cooling_supplier",
        "chilled_water",
    ),
    "business_travel": (
        "trip_date",
        "booking_reference",
        "departure_airport",
        "arrival_airport",
        "rail_route",
        "cabin_class",
        "travel_distance",
        "traveler_name",
    ),
    "employee_commuting": (
        "home_postcode",
        "office_location",
        "commute_days",
        "commute_distance",
        "transport_mode",
        "employee_id",
    ),
    "waste_generated": (
        "waste_stream",
        "waste_vendor",
        "disposal_method",
        "recycling_method",
        "landfill_weight",
        "waste_manifest",
    ),
    "purchased_goods": (
        "supplier_name",
        "vendor_name",
        "invoice_number",
        "gl_code",
        "cost_center",
        "line_total",
        "spend_amount",
        "commodity_code",
    ),
    "upstream_transport": (
        "carrier_name",
        "shipment_id",
        "origin_port",
        "destination_port",
        "freight_weight",
        "tonne_km",
    ),
    "downstream_transport": (
        "customer_delivery",
        "distribution_center",
        "delivery_mode",
        "delivery_weight",
        "delivery_distance",
        "tonne_km",
    ),
}


ENTERPRISE_VALUE_HINTS: Dict[str, tuple[str, ...]] = {
    "waste_generated": (
        "plastic",
        "plastics",
        "hazardous",
        "recycling",
        "generalwaste",
        "landfill",
        "incineration",
        "waste",
        "compost",
    ),
    "fugitive_emissions": (
        "refrigerant",
        "hfc",
        "r134a",
        "r410a",
        "r407c",
        "r32",
        "gasleak",
        "topup",
        "hvac",
    ),
    "stationary_combustion": (
        "naturalgas",
        "therms",
        "boiler",
        "generator",
        "fueloil",
        "biomass",
    ),
    "mobile_combustion": (
        "diesel",
        "petrol",
        "fleet",
        "odometer",
        "mileage",
        "vehicle",
    ),
    "business_travel": (
        "flight",
        "air",
        "rail",
        "bus",
        "trip",
        "booking",
        "passenger",
    ),
    "purchased_electricity": (
        "kwh",
        "meter",
        "electricity",
        "grid",
        "tariff",
        "utility",
    ),
}


def _normalize_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _tokenize(value: str) -> set[str]:
    raw = re.split(r"[^a-zA-Z0-9]+", value.lower())
    return {_normalize_token(token) for token in raw if token.strip()}


def _collect_upload_tokens(upload: Mapping[str, Any]) -> set[str]:
    tokens: set[str] = set()
    for key in ("file_name", "storage_path", "file_type", "upload_method"):
        value = upload.get(key)
        if isinstance(value, str) and value.strip():
            tokens.update(_tokenize(value))
    return tokens


def _collect_header_tokens(rows: Iterable[Mapping[str, Any]], max_rows: int = 20) -> set[str]:
    tokens: set[str] = set()
    for idx, row in enumerate(rows):
        if idx >= max_rows:
            break
        for key in row.keys():
            if isinstance(key, str):
                tokens.add(_normalize_token(key))
    return tokens


def _collect_value_tokens(rows: Iterable[Mapping[str, Any]], max_rows: int = 40) -> set[str]:
    tokens: set[str] = set()
    for idx, row in enumerate(rows):
        if idx >= max_rows:
            break
        for value in row.values():
            if value is None:
                continue
            if not isinstance(value, str):
                continue
            text = value.strip()
            if not text:
                continue
            for token in _tokenize(text):
                if token:
                    tokens.add(token)
    return tokens


def _score_from_schema_fields(
    activity_type: str,
    header_tokens: set[str],
) -> float:
    schema = SCHEMAS.get(activity_type)
    if not isinstance(schema, Mapping):
        return 0.0

    fields = schema.get("fields")
    if not isinstance(fields, Mapping):
        return 0.0

    score = 0.0
    for field_name, field_def in fields.items():
        token = _normalize_token(str(field_name))
        required = bool(isinstance(field_def, Mapping) and field_def.get("required"))
        weight = 2.5 if required else 1.0
        if token in header_tokens:
            score += weight

    return score


def _score_from_aliases(activity_type: str, header_tokens: set[str]) -> float:
    aliases = COLUMN_ALIASES.get(activity_type, {})
    if not aliases and activity_type in LEGACY_ACTIVITY_ALIAS_FALLBACKS:
        aliases = COLUMN_ALIASES.get(LEGACY_ACTIVITY_ALIAS_FALLBACKS[activity_type], {})

    score = 0.0
    for canonical_field, alias_values in aliases.items():
        canonical_token = _normalize_token(canonical_field)
        if canonical_token in header_tokens:
            score += 1.5

        for alias in alias_values:
            if _normalize_token(str(alias)) in header_tokens:
                score += 1.0
                break

    return score


def _score_from_sample_values(activity_type: str, rows: Iterable[Mapping[str, Any]]) -> float:
    schema = SCHEMAS.get(activity_type)
    if not isinstance(schema, Mapping):
        return 0.0

    fields = schema.get("fields")
    if not isinstance(fields, Mapping):
        return 0.0

    enums: Dict[str, set[str]] = {}
    for field_name, field_def in fields.items():
        if isinstance(field_def, Mapping) and isinstance(field_def.get("enum"), list):
            enums[str(field_name)] = {
                _normalize_token(str(enum_item)) for enum_item in field_def["enum"]
            }

    if not enums:
        return 0.0

    score = 0.0
    for idx, row in enumerate(rows):
        if idx >= 25:
            break
        for field_name, enum_values in enums.items():
            value = row.get(field_name)
            if value is None:
                continue
            normalized_value = _normalize_token(str(value))
            if normalized_value and normalized_value in enum_values:
                score += 1.2
                break

    return score


def _score_from_upload_tokens(activity_type: str, upload_tokens: set[str]) -> float:
    schema = SCHEMAS.get(activity_type)
    if not isinstance(schema, Mapping):
        return 0.0

    score = 0.0

    type_tokens = _tokenize(activity_type)
    if type_tokens and type_tokens.issubset(upload_tokens):
        score += 4.0
    else:
        overlap = len(type_tokens.intersection(upload_tokens))
        score += float(overlap) * 1.0

    description = schema.get("description")
    if isinstance(description, str):
        overlap = len(_tokenize(description).intersection(upload_tokens))
        score += float(overlap) * 0.5

    category = schema.get("emissions_category")
    if isinstance(category, str) and _normalize_token(category) in upload_tokens:
        score += 1.0

    return score


def _score_from_enterprise_hints(
    activity_type: str,
    header_tokens: set[str],
    upload_tokens: set[str],
) -> float:
    hints = ENTERPRISE_HEADER_HINTS.get(activity_type, ())
    score = 0.0
    for hint in hints:
        normalized_hint = _normalize_token(hint)
        if normalized_hint in header_tokens:
            score += 1.4
        elif normalized_hint in upload_tokens:
            score += 0.6
    return score


def _score_from_value_hints(activity_type: str, value_tokens: set[str]) -> float:
    hints = ENTERPRISE_VALUE_HINTS.get(activity_type, ())
    if not hints:
        return 0.0

    score = 0.0
    for hint in hints:
        normalized_hint = _normalize_token(hint)
        if normalized_hint in value_tokens:
            score += 1.2

    # Penalize fugitive if strong waste signals are present.
    if activity_type == "fugitive_emissions":
        waste_signals = {"plastic", "hazardous", "recycling", "generalwaste", "landfill", "waste"}
        overlap = len(waste_signals.intersection(value_tokens))
        if overlap >= 2:
            score -= float(overlap) * 1.0

    return score


@dataclass(frozen=True)
class InferenceResult:
    activity_type: Optional[str]
    confidence: float
    score: float
    second_best_activity_type: Optional[str]
    second_best_score: float
    review_required: bool


def infer_activity_type(
    upload: Mapping[str, Any],
    raw_rows: list[Dict[str, Any]],
) -> InferenceResult:
    upload_tokens = _collect_upload_tokens(upload)
    header_tokens = _collect_header_tokens(raw_rows)
    value_tokens = _collect_value_tokens(raw_rows)

    scored: list[tuple[str, float]] = []

    for activity_type in SCHEMAS.keys():
        total = 0.0
        total += _score_from_upload_tokens(activity_type, upload_tokens)
        total += _score_from_schema_fields(activity_type, header_tokens)
        total += _score_from_aliases(activity_type, header_tokens)
        total += _score_from_sample_values(activity_type, raw_rows)
        total += _score_from_enterprise_hints(activity_type, header_tokens, upload_tokens)
        total += _score_from_value_hints(activity_type, value_tokens)
        scored.append((activity_type, total))

    if not scored:
        return InferenceResult(None, 0.0, 0.0, None, 0.0, True)

    scored.sort(key=lambda item: item[1], reverse=True)
    top_type, top_score = scored[0]
    second_type = scored[1][0] if len(scored) > 1 else None
    second_score = scored[1][1] if len(scored) > 1 else 0.0
    gap = top_score - second_score

    # Confidence curve tuned to avoid false-positive auto assignments.
    confidence = min(1.0, max(0.0, (top_score / 18.0) + (gap / 10.0)))
    review_required = top_score < 3.0 or gap < 1.0 or confidence < 0.45

    if top_score <= 0:
        return InferenceResult(None, confidence, top_score, second_type, second_score, True)

    return InferenceResult(
        top_type,
        confidence,
        top_score,
        second_type,
        second_score,
        review_required,
    )