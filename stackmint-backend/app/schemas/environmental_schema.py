# schemas.py

from typing import List, Dict, Optional
from pydantic import BaseModel, Field


class ScopeData(BaseModel):
    total_emissions_kg: Optional[float] = None
    sources: List[str] = Field(default_factory=list)


class EmissionsData(BaseModel):
    matched_columns: List[str] = Field(default_factory=list)
    total_emissions_kg: Optional[float] = None
    total: Dict[str, Optional[float]] = Field(default_factory=dict)
    average: Dict[str, Optional[float]] = Field(default_factory=dict)
    scopes: Dict[str, ScopeData] = Field(default_factory=lambda: {
        "scope_1": ScopeData(),
        "scope_2": ScopeData(),
        "scope_3": ScopeData()
    })


class EnergyData(BaseModel):
    matched_columns: List[str] = Field(default_factory=list)
    total_energy_kwh: Optional[float] = None
    total: Dict[str, Optional[float]] = Field(default_factory=dict)
    average: Dict[str, Optional[float]] = Field(default_factory=dict)


class WaterUsageData(BaseModel):
    matched_columns: List[str] = Field(default_factory=list)
    total_liters: Optional[float] = None
    average_per_month: Optional[float] = None


class WasteData(BaseModel):
    matched_columns: List[str] = Field(default_factory=list)
    total_waste_kg: Optional[float] = None
    hazardous_waste_kg: Optional[float] = None
    recycled_waste_kg: Optional[float] = None


class DerivedMetrics(BaseModel):
    emissions_per_kwh: Optional[float] = None
    emissions_per_employee: Optional[float] = None
    energy_intensity: Optional[float] = None
    waste_per_unit_production: Optional[float] = None


class AiAnalysis(BaseModel):
    missing_data_fields: List[str] = Field(default_factory=list)
    anomalies: List[str] = Field(default_factory=list)
    inferred_scopes: List[str] = Field(default_factory=list)
    ai_comments: List[str] = Field(default_factory=list)


class NumericSummary(BaseModel):
    year: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    month: Dict[str, Dict[str, float]] = Field(default_factory=dict)


class PartialAnalysis(BaseModel):
    numeric_summary: NumericSummary = Field(default_factory=NumericSummary)
    energy: EnergyData = Field(default_factory=EnergyData)
    emissions: EmissionsData = Field(default_factory=EmissionsData)
    water_usage: WaterUsageData = Field(default_factory=WaterUsageData)
    waste: WasteData = Field(default_factory=WasteData)
    derived_metrics: DerivedMetrics = Field(default_factory=DerivedMetrics)
    ai_analysis: AiAnalysis = Field(default_factory=AiAnalysis)


class EnvironmentalInsights(BaseModel):
    category: str = "environmental"
    file_count: int = 0
    record_count: int = 0
    partial_analysis: PartialAnalysis = Field(default_factory=PartialAnalysis)
