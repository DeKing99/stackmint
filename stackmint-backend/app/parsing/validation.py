from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, date
import re

from parsing.schemas import SCHEMAS


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

def _parse_number(value: Any) -> Optional[float]:
    if value is None:
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

    s = str(value).strip()

    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y", "%d/%m/%Y"):
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

    if value is None:
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
            return coerced

        elif field_type == "string":
            coerced = str(value).strip()
            
            if enum_vals:
                match = None
                for e in enum_vals:
                    if coerced.lower() == str(e).lower():
                        match = e
                        break
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

    for field_name, field_def in fields.items():
        raw_value = row.get(field_name)

        validated[field_name] = _validate_field(
            field_name,
            raw_value,
            field_def,
        )

    if allow_extra:
        extras = {
            k: v for k, v in row.items()
            if k not in validated
        }
        if extras:
            validated["_audit_extra"] = extras

    return validated