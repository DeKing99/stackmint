# parsing/schemas.py

SCHEMA_VERSION = "2.0.0"

# ==========================================================
# ENTERPRISE GHG-ALIGNED ACTIVITY SCHEMAS
# ==========================================================

SCHEMAS = {

    # ======================================================
    # SCOPE 1 — DIRECT EMISSIONS
    # ======================================================

    "stationary_combustion": {
        "version": SCHEMA_VERSION,
        "description": "On-site fuel combustion (boilers, generators, furnaces)",
        "emissions_category": "fuel",
        "scope": "scope_1",

        "emissions_factor_lookup": {
            "match_fields": ["fuel_type", "unit", "region", "year"]
        },

        "fields": {
            "date": {"type": "date", "required": True},
            "facility_id": {"type": "string", "required": True},

            "fuel_type": {
                "type": "string",
                "required": True,
                "enum": ["natural_gas", "fuel_oil", "coal", "lpg", "biomass"]
            },

            "consumption": {
                "type": "float",
                "required": True,
                "unit_dimension": "energy"
            },

            "unit": {
                "type": "string",
                "required": True,
                "enum": ["kwh", "mwh", "therms", "m3", "liters"]
            },

            "region": {"type": "string", "required": False},
            "year": {"type": "integer", "required": False}
        }
    },

    "mobile_combustion": {
        "version": SCHEMA_VERSION,
        "description": "Fuel used in company-owned vehicles",
        "emissions_category": "transport",
        "scope": "scope_1",

        "emissions_factor_lookup": {
            "match_fields": ["fuel_type", "unit", "region", "year"]
        },

        "fields": {
            "date": {"type": "date", "required": True},
            "vehicle_id": {"type": "string", "required": False},

            "fuel_type": {
                "type": "string",
                "required": True,
                "enum": ["diesel", "petrol", "lpg", "cng"]
            },

            "consumption": {
                "type": "float",
                "required": True,
                "unit_dimension": "volume"
            },

            "unit": {
                "type": "string",
                "required": True,
                "enum": ["liters", "gallons"]
            },

            "region": {"type": "string", "required": False},
            "year": {"type": "integer", "required": False}
        }
    },

    "fugitive_emissions": {
        "version": SCHEMA_VERSION,
        "description": "Refrigerant and other fugitive gas leakage",
        "emissions_category": "fugitive",
        "scope": "scope_1",

        "emissions_factor_lookup": {
            "match_fields": ["gas_type"]
        },

        "fields": {
            "date": {"type": "date", "required": True},
            "facility_id": {"type": "string", "required": True},

            "gas_type": {
                "type": "string",
                "required": True
            },

            "amount_released": {
                "type": "float",
                "required": True,
                "unit_dimension": "mass"
            },

            "unit": {
                "type": "string",
                "required": True,
                "enum": ["kg", "tonnes"]
            }
        }
    },

    # ======================================================
    # SCOPE 2 — PURCHASED ENERGY
    # ======================================================

    "purchased_electricity": {
        "version": SCHEMA_VERSION,
        "description": "Electricity purchased from grid",
        "emissions_category": "energy",
        "scope": "scope_2",

        "emissions_factor_lookup": {
            "match_fields": ["region", "year", "unit"]
        },

        "fields": {
            "date": {"type": "date", "required": True},
            "facility_id": {"type": "string", "required": True},

            "consumption": {
                "type": "float",
                "required": True,
                "unit_dimension": "energy"
            },

            "unit": {
                "type": "string",
                "required": True,
                "enum": ["kwh", "mwh"]
            },

            "region": {"type": "string", "required": True},
            "year": {"type": "integer", "required": False},
            "market_based": {"type": "boolean", "required": False}
        }
    },

    "purchased_steam": {
        "version": SCHEMA_VERSION,
        "description": "Purchased steam",
        "emissions_category": "energy",
        "scope": "scope_2",

        "emissions_factor_lookup": {
            "match_fields": ["region", "year"]
        },

        "fields": {
            "date": {"type": "date", "required": True},
            "facility_id": {"type": "string", "required": True},

            "consumption": {"type": "float", "required": True},
            "unit": {"type": "string", "required": True}
        }
    },

    "purchased_heating": {
        "version": SCHEMA_VERSION,
        "description": "Purchased district heating",
        "emissions_category": "energy",
        "scope": "scope_2",
        "emissions_factor_lookup": {"match_fields": ["region", "year"]},
        "fields": {
            "date": {"type": "date", "required": True},
            "facility_id": {"type": "string", "required": True},
            "consumption": {"type": "float", "required": True},
            "unit": {"type": "string", "required": True}
        }
    },

    "purchased_cooling": {
        "version": SCHEMA_VERSION,
        "description": "Purchased cooling",
        "emissions_category": "energy",
        "scope": "scope_2",
        "emissions_factor_lookup": {"match_fields": ["region", "year"]},
        "fields": {
            "date": {"type": "date", "required": True},
            "facility_id": {"type": "string", "required": True},
            "consumption": {"type": "float", "required": True},
            "unit": {"type": "string", "required": True}
        }
    },

    # ======================================================
    # SCOPE 3 — VALUE CHAIN
    # ======================================================

    "business_travel": {
        "version": SCHEMA_VERSION,
        "description": "Employee business travel",
        "emissions_category": "transport",
        "scope": "scope_3",
        "emissions_factor_lookup": {"match_fields": ["travel_mode"]},
        "fields": {
            "date": {"type": "date", "required": True},
            "travel_mode": {
                "type": "string",
                "required": True,
                "enum": ["air", "rail", "car", "bus"]
            },
            "distance": {"type": "float", "required": True},
            "unit": {"type": "string", "required": True, "enum": ["km", "miles"]}
        }
    },

    "employee_commuting": {
        "version": SCHEMA_VERSION,
        "description": "Employee commuting emissions",
        "emissions_category": "transport",
        "scope": "scope_3",
        "emissions_factor_lookup": {"match_fields": ["commute_mode"]},
        "fields": {
            "date": {"type": "date", "required": True},
            "commute_mode": {"type": "string", "required": True},
            "distance": {"type": "float", "required": True},
            "unit": {"type": "string", "required": True}
        }
    },

    "waste_generated": {
        "version": SCHEMA_VERSION,
        "description": "Waste generated in operations",
        "emissions_category": "waste",
        "scope": "scope_3",
        "emissions_factor_lookup": {"match_fields": ["waste_type"]},
        "fields": {
            "date": {"type": "date", "required": True},
            "waste_type": {"type": "string", "required": True},
            "amount": {"type": "float", "required": True},
            "unit": {"type": "string", "required": True}
        }
    },

    "purchased_goods": {
        "version": SCHEMA_VERSION,
        "description": "Purchased goods and services",
        "emissions_category": "procurement",
        "scope": "scope_3",
        "emissions_factor_lookup": {"match_fields": ["category"]},
        "fields": {
            "date": {"type": "date", "required": True},
            "category": {"type": "string", "required": True},
            "amount_spent": {"type": "float", "required": True},
            "currency": {"type": "string", "required": True}
        }
    },

    "upstream_transport": {
        "version": SCHEMA_VERSION,
        "description": "Upstream transportation and distribution",
        "emissions_category": "transport",
        "scope": "scope_3",
        "emissions_factor_lookup": {"match_fields": ["transport_mode"]},
        "fields": {
            "date": {"type": "date", "required": True},
            "transport_mode": {"type": "string", "required": True},
            "distance": {"type": "float", "required": True},
            "unit": {"type": "string", "required": True}
        }
    },

    "downstream_transport": {
        "version": SCHEMA_VERSION,
        "description": "Downstream transportation and distribution",
        "emissions_category": "transport",
        "scope": "scope_3",
        "emissions_factor_lookup": {"match_fields": ["transport_mode"]},
        "fields": {
            "date": {"type": "date", "required": True},
            "transport_mode": {"type": "string", "required": True},
            "distance": {"type": "float", "required": True},
            "unit": {"type": "string", "required": True}
        }
    }
}