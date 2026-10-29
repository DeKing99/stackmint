from dataclasses import dataclass
from typing import Literal


Frequency = Literal[
    "monthly",
    "quarterly",
    "annual",
]


@dataclass
class CollectionRule:
    activity_type: str
    display_name: str
    frequency: Frequency
    is_required: bool


@dataclass
class CollectionUnit:
    activity_type: str
    location_id: str
    period: str
    completed: bool
    quality_score: float | None