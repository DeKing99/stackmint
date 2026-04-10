from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, date
import re
import math

from app.parsing.schemas import SCHEMAS


class ValidationError(Exception):
    def __init__(self, message: str, field_path: Optional[str] = None):
        self.message = message
        self.field_path = field_path
        super().__init__(self.__str__())

    def __str__(self):
        return f"{self.message}" + (
            f" (field: {self.field_path})" if self.field_path else ""
        )


# -----------------------------
# Type Parsers
# -----------------------------

EMPTY_VALUE_TOKENS = {"", "none", "null", "nan", "n/a", "na", "-"}


def _is_effectively_empty(value: Any) -> bool:
    if value is None:
        return True

    if isinstance(value, float) and math.isnan(value):
        return True

    if isinstance(value, str) and value.strip().lower() in EMPTY_VALUE_TOKENS:
        return True

    return False


def _normalize_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.strip().lower())


ENUM_ALIASES: Dict[str, Dict[str, str]] = {
    "fuel_type": {
        "naturalgas": "natural_gas",
        "naturalgasfuel": "natural_gas",
        "dieselfuel": "diesel",
        "gasoline": "petrol",
        "petrolfuel": "petrol",
    },
    "travel_mode": {
        "plane": "air",
        "flight": "air",
        "train": "rail",
        "automobile": "car",
        "coach": "bus",
    },
    "transport_mode": {
        "plane": "air",
        "flight": "air",
        "train": "rail",
    },
    "commute_mode": {
        "train": "rail",
    },
    "unit": {
        "kwh": "kwh",
        "kilowatthour": "kwh",
        "kilowatthours": "kwh",
        "mwh": "mwh",
        "therm": "therms",
        "therms": "therms",
        "m3": "m3",
        "cubicmeter": "m3",
        "cubicmeters": "m3",
        "liter": "liters",
        "litre": "liters",
        "litres": "liters",
        "liters": "liters",
        "gallon": "gallons",
        "gallons": "gallons",
        "mile": "miles",
        "miles": "miles",
        "km": "km",
        "kilometer": "km",
        "kilometers": "km",
        "kilometre": "km",
        "kilometres": "km",
        "ton": "tonnes",
        "tons": "tonnes",
        "tonne": "tonnes",
        "tonnes": "tonnes",
        "kg": "kg",
    },
    "gas_type": {
        "r134a": "r134a",
        "hfc134a": "r134a",
        "hfc143a": "r143a",
        "r143a": "r143a",
        "r410a": "r410a",
        "hfc410a": "r410a",
        "co2": "co2",
        "carbondioxide": "co2",
    },
}


def _normalize_enum_candidate(field_name: str, raw_value: str) -> str:
    token = _normalize_token(raw_value)
    aliases = ENUM_ALIASES.get(field_name, {})
    return aliases.get(token, raw_value.strip().lower())


def _resolve_enum_match(
    field_name: str,
    raw_value: str,
    enum_vals: List[Any],
) -> Any | None:
    normalized_candidate = _normalize_enum_candidate(field_name, raw_value)

    for enum_value in enum_vals:
        if normalized_candidate == str(enum_value).lower():
            return enum_value

    enum_tokens: Dict[str, Any] = {
        _normalize_token(str(enum_value)): enum_value for enum_value in enum_vals
    }
    candidate_token = _normalize_token(normalized_candidate)
    if candidate_token in enum_tokens:
        return enum_tokens[candidate_token]

    if field_name == "fuel_type":
        if "naturalgas" in candidate_token and "naturalgas" in enum_tokens:
            return enum_tokens["naturalgas"]

        if (
            "fueloil" in enum_tokens
            and candidate_token in {"diesel", "dieselfuel", "heatingoil", "furnaceoil", "oil"}
        ):
            return enum_tokens["fueloil"]

        if "coal" in candidate_token and "coal" in enum_tokens:
            return enum_tokens["coal"]

        if "lpg" in candidate_token and "lpg" in enum_tokens:
            return enum_tokens["lpg"]

        if "biomass" in candidate_token and "biomass" in enum_tokens:
            return enum_tokens["biomass"]

    return None

def _parse_number(value: Any) -> Optional[float]:
    if _is_effectively_empty(value):
        return None

    if isinstance(value, (int, float)):
        return float(value)

    s = str(value).strip()
    if not s:
        return None

    s = re.sub(r"[^\d\-\.,\(\)]", "", s)

    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]

    s = s.replace(",", "").replace(" ", "")

    try:
        return float(s)
    except ValueError:
        return None


def _parse_int(value: Any) -> Optional[int]:
    num = _parse_number(value)
    if num is None:
        return None
    return int(num)


def _parse_date(value: Any) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value

    if isinstance(value, datetime):
        return value.date()

    if _is_effectively_empty(value):
        raise ValidationError("Unrecognized date format")

    s = str(value).strip()

    # Year-only exports are common in enterprise reporting files.
    if re.fullmatch(r"\d{4}", s):
        return date(int(s), 1, 1)

    # Month/year variants like 03/2024 or 2024-03.
    month_year_patterns = (
        (r"^(\d{1,2})[/-](\d{4})$", True),
        (r"^(\d{4})[/-](\d{1,2})$", False),
    )
    for pattern, month_first in month_year_patterns:
        match = re.match(pattern, s)
        if not match:
            continue
        first = int(match.group(1))
        second = int(match.group(2))
        month = first if month_first else second
        year = second if month_first else first
        if 1 <= month <= 12 and 1900 <= year <= 2100:
            return date(year, month, 1)

    for fmt in (
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%d-%m-%Y",
        "%m-%d-%Y",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%m.%d.%Y",
        "%d.%m.%Y",
    ):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            continue

    raise ValidationError("Unrecognized date format")


def _check_enum(value: Any, enum_values: List[Any]) -> bool:
    if value is None:
        return True

    if isinstance(value, str):
        return value.lower() in [str(e).lower() for e in enum_values]

    return value in enum_values


# -----------------------------
# Core Field Validation
# -----------------------------

def _validate_field(
    field_name: str,
    value: Any,
    schema_def: Dict[str, Any],
) -> Any:

    field_type = schema_def.get("type")
    required = schema_def.get("required", False)
    enum_vals = schema_def.get("enum")

    if _is_effectively_empty(value):
        if required:
            raise ValidationError("Field is required", field_name)
        return None

    try:

        if field_type == "float":
            coerced = _parse_number(value)
            if coerced is None:
                raise ValidationError("Invalid float", field_name)
            return coerced

        elif field_type == "integer":
            coerced = _parse_int(value)
            if coerced is None:
                raise ValidationError("Invalid integer", field_name)

            if field_name == "year" and (coerced < 1900 or coerced > 2100):
                raise ValidationError("Invalid value", field_name)

            return coerced

        elif field_type == "string":
            coerced = str(value).strip()
            
            if enum_vals:
                match = _resolve_enum_match(field_name, coerced, enum_vals)
                if not match:
                    raise ValidationError(
                        f"Must be one of {enum_vals}",
                        field_name
                    )
                return match
            return coerced
            # if enum_vals and not _check_enum(coerced, enum_vals):
            #     raise ValidationError(
            #         f"Must be one of {enum_vals}",
            #         field_name
            #     )
            # return coerced

        elif field_type == "boolean":
            if isinstance(value, bool):
                return value

            s = str(value).strip().lower()
            if s in ("true", "1", "yes", "y"):
                return True
            if s in ("false", "0", "no", "n"):
                return False

            raise ValidationError("Invalid boolean", field_name)

        elif field_type == "date":
            return _parse_date(value)

        else:
            raise ValidationError(
                f"Unsupported type: {field_type}",
                field_name
            )

    except ValidationError:
        raise

    except Exception:
        raise ValidationError("Invalid value", field_name)


# -----------------------------
# Public API
# -----------------------------

def validate_row(
    row: Dict[str, Any],
    activity_type: str,
    allow_extra: bool = True
) -> Dict[str, Any]:

    schema = SCHEMAS.get(activity_type)

    if not schema:
        raise ValidationError(
            f"Unknown activity type: {activity_type}"
        )

    validated: Dict[str, Any] = {}
    fields = schema.get("fields", {})
    parsed_date: Optional[date] = None

    for field_name, field_def in fields.items():
        raw_value = row.get(field_name)

        if field_name == "year":
            try:
                validated[field_name] = _validate_field(
                    field_name,
                    raw_value,
                    field_def,
                )
            except ValidationError:
                if parsed_date is not None:
                    validated[field_name] = parsed_date.year
                else:
                    raise
            continue

        validated[field_name] = _validate_field(
            field_name,
            raw_value,
            field_def,
        )

        if field_name == "date" and isinstance(validated[field_name], date):
            parsed_date = validated[field_name]

    if "year" in fields and validated.get("year") is None and parsed_date is not None:
        validated["year"] = parsed_date.year

    if allow_extra:
        extras = {
            k: v for k, v in row.items()
            if k not in validated
        }
        if extras:
            validated["_audit_extra"] = extras

    return validated