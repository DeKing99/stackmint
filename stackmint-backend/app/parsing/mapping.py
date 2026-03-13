# parsing/mapping.py

from typing import Dict, Any, Tuple
import re
from parsing.schemas import SCHEMAS


# -----------------------------
# Deterministic Alias Map
# -----------------------------

COLUMN_ALIASES: Dict[str, Dict[str, list]] = {

    # -------------------------------------------------
    # ENERGY USAGE
    # -------------------------------------------------
    "energy_usage": {
        "date": ["date", "usage_date", "invoice_date"],
        "facility_id": ["facility", "site", "location", "plant"],
        "meter_id": ["meter", "meter_number", "meter_id"],
        "energy_type": ["energy", "fuel_type", "utility_type"],
        "consumption": ["usage", "quantity", "kwh", "mwh", "amount_used"],
        "unit": ["unit", "uom"],
        "amount": ["cost", "total_cost", "amount"],
        "currency": ["currency", "ccy"],
    },

    # -------------------------------------------------
    # STATIONARY FUEL COMBUSTION
    # -------------------------------------------------
    "fuel_combustion": {
        "date": ["date", "fuel_date"],
        "facility_id": ["facility", "site"],
        "vehicle_type": ["equipment_type", "machine_type"],
        "fuel_type": ["fuel", "fuel_category"],
        "fuel_quantity": ["liters", "gallons", "fuel_used", "quantity"],
        "unit": ["unit", "uom"],
        "amount": ["cost", "fuel_cost"],
        "currency": ["currency"],
    },

    # -------------------------------------------------
    # MOBILE FUEL COMBUSTION (FLEET)
    # -------------------------------------------------
    "mobile_combustion": {
        "date": ["date"],
        "vehicle_type": ["vehicle", "fleet_type", "vehicle_category"],
        "fuel_type": ["fuel"],
        "fuel_quantity": ["liters", "gallons", "quantity"],
        "distance": ["km", "miles", "distance_travelled"],
        "unit": ["unit"],
    },

    # -------------------------------------------------
    # BUSINESS TRAVEL
    # -------------------------------------------------
    "business_travel": {
        "date": ["date", "travel_date"],
        "travel_mode": ["mode", "transport", "travel_type"],
        "distance": ["km", "miles", "distance"],
        "unit": ["unit"],
        "passengers": ["employees", "people", "headcount"],
        "origin_country": ["origin", "from_country"],
        "destination_country": ["destination", "to_country"],
        "amount": ["cost", "ticket_cost"],
        "currency": ["currency"],
    },

    # -------------------------------------------------
    # EMPLOYEE COMMUTING
    # -------------------------------------------------
    "employee_commuting": {
        "date": ["date"],
        "commute_mode": ["mode", "transport"],
        "distance": ["km", "miles"],
        "employees": ["headcount", "people"],
        "working_days": ["days", "working_days"],
    },

    # -------------------------------------------------
    # WASTE GENERATED
    # -------------------------------------------------
    "waste_generated": {
        "date": ["date"],
        "facility_id": ["facility", "site"],
        "waste_type": ["waste", "waste_category"],
        "disposal_method": ["method", "treatment_method"],
        "quantity": ["weight", "tonnes", "kg", "quantity"],
        "unit": ["unit"],
    },

    # -------------------------------------------------
    # WATER USAGE
    # -------------------------------------------------
    "water_usage": {
        "date": ["date"],
        "facility_id": ["facility", "site"],
        "water_type": ["water_category"],
        "quantity": ["volume", "m3", "liters"],
        "unit": ["unit"],
    },

    # -------------------------------------------------
    # FREIGHT & LOGISTICS
    # -------------------------------------------------
    "freight_transport": {
        "date": ["date"],
        "freight_mode": ["mode", "transport_type"],
        "distance": ["km", "miles"],
        "weight": ["weight", "tonnes", "kg"],
        "unit": ["unit"],
        "origin_country": ["origin"],
        "destination_country": ["destination"],
    },

    # -------------------------------------------------
    # PURCHASED GOODS & SERVICES
    # -------------------------------------------------
    "purchased_goods": {
        "date": ["date", "invoice_date"],
        "vendor": ["supplier", "vendor_name"],
        "material_type": ["material", "category"],
        "quantity": ["quantity", "units"],
        "unit": ["unit"],
        "amount": ["cost", "total"],
        "currency": ["currency"],
    },

    # -------------------------------------------------
    # CAPITAL GOODS
    # -------------------------------------------------
    "capital_goods": {
        "date": ["date"],
        "asset_type": ["asset", "equipment"],
        "quantity": ["quantity"],
        "unit": ["unit"],
        "amount": ["cost"],
        "currency": ["currency"],
    },

    # -------------------------------------------------
    # REFRIGERANT LEAKAGE
    # -------------------------------------------------
    "refrigerant_leakage": {
        "date": ["date"],
        "facility_id": ["facility"],
        "refrigerant_type": ["refrigerant", "gas_type"],
        "quantity": ["kg", "quantity"],
        "unit": ["unit"],
    },

    # -------------------------------------------------
    # UPSTREAM / DOWNSTREAM TRANSPORT
    # -------------------------------------------------
    "transport_and_distribution": {
        "date": ["date"],
        "transport_mode": ["mode"],
        "distance": ["km", "miles"],
        "weight": ["weight", "tonnes"],
        "unit": ["unit"],
    },
}

# Backward-compatible alias fallbacks for renamed/merged activity types.
LEGACY_ACTIVITY_ALIAS_FALLBACKS: Dict[str, str] = {
    "stationary_combustion": "fuel_combustion",
    "fugitive_emissions": "refrigerant_leakage",
    "upstream_transport": "transport_and_distribution",
    "downstream_transport": "transport_and_distribution",
    "purchased_electricity": "energy_usage",
    "purchased_steam": "energy_usage",
    "purchased_heating": "energy_usage",
    "purchased_cooling": "energy_usage",
}

LEGACY_SCHEMA_FIELD_RENAMES: Dict[str, Dict[str, str]] = {
    "mobile_combustion": {
        "fuel_quantity": "consumption",
        "vehicle_type": "vehicle_id",
    },
    "stationary_combustion": {
        "fuel_quantity": "consumption",
    },
    "fugitive_emissions": {
        "refrigerant_type": "gas_type",
        "quantity": "amount_released",
    },
    "waste_generated": {
        "quantity": "amount",
    },
    "purchased_goods": {
        "material_type": "category",
        "amount": "amount_spent",
    },
}

# -----------------------------
# Utilities
# -----------------------------

def _normalize_key(k: str) -> str:
    return re.sub(r"[^\w]", "", k.strip().lower())


# -----------------------------
# Core Mapping Logic
# -----------------------------

def normalize_columns(
    row: Dict[str, Any],
    activity_type: str,
    company_mappings: Dict[str, str] | None = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Normalize row columns to canonical schema fields.

    Order of resolution:
    1. Company-specific saved mappings
    2. Deterministic alias map
    3. Strict schema field name match
    """

    if activity_type not in SCHEMAS:
        raise ValueError(f"Unknown activity type: {activity_type}")

    schema_fields = SCHEMAS[activity_type]["fields"].keys()
    schema_field_set = set(schema_fields)

    activity_aliases = COLUMN_ALIASES.get(activity_type, {})
    if not activity_aliases and activity_type in LEGACY_ACTIVITY_ALIAS_FALLBACKS:
        legacy_key = LEGACY_ACTIVITY_ALIAS_FALLBACKS[activity_type]
        activity_aliases = COLUMN_ALIASES.get(legacy_key, {})

    legacy_field_renames = LEGACY_SCHEMA_FIELD_RENAMES.get(activity_type, {})

    # Normalize stale alias entries to current schema field names and drop unsupported ones.
    normalized_activity_aliases: Dict[str, list] = {}
    for alias_field, aliases in activity_aliases.items():
        target_field = legacy_field_renames.get(alias_field, alias_field)
        if target_field not in schema_field_set:
            continue

        if target_field not in normalized_activity_aliases:
            normalized_activity_aliases[target_field] = []
        normalized_activity_aliases[target_field].extend(aliases)

    activity_aliases = normalized_activity_aliases


    normalized = {}
    unmapped = {}
    #im not sure if this is meant to be here or further down.
    used_source_keys = set()
    
    

    company_mappings = company_mappings or {}

    normalized_input_map = {
        _normalize_key(k): k for k in row.keys()
    }

    for canonical_field in schema_fields:
        
        orig_key = None
        value = None

        # ----------------------------------
        # 1️⃣ Company-Specific Saved Mapping
        # ----------------------------------
        for source_col, target_col in company_mappings.items():
            if target_col == canonical_field:
                norm_source = _normalize_key(source_col)
                if norm_source in normalized_input_map:
                    orig_key = normalized_input_map[norm_source]
                    value = row[orig_key]
                    break

        # ----------------------------------
        # 2️⃣ Alias-Based Matching
        # ----------------------------------
        #activity_aliases = COLUMN_ALIASES.get(activity_type, {})
        
        if value is None and canonical_field in activity_aliases:
            for alias in activity_aliases[canonical_field]:
                alias_norm = _normalize_key(alias)
                if alias_norm in normalized_input_map:
                    orig_key = normalized_input_map[alias_norm]
                    value = row[orig_key]
                    break

        # ----------------------------------
        # 3️⃣ Strict Field Match
        # ----------------------------------
        if value is None:
            canonical_norm = _normalize_key(canonical_field)
            if canonical_norm in normalized_input_map:
                orig_key = normalized_input_map[canonical_norm]
                value = row[orig_key]

        if value is not None and orig_key is not None:
            normalized[canonical_field] = value
            used_source_keys.add(orig_key)
    # Collect unmapped fields
    for original_key in row.keys():
        if original_key not in used_source_keys:
            unmapped[original_key] = row[original_key]

    return normalized, unmapped