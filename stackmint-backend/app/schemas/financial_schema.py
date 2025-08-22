from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Union

class FinancialNumericSummary(BaseModel):
    year: Optional[Dict[str, Union[int, float]]] = None
    month: Optional[Dict[str, Union[int, float]]] = None
    revenue_gbp: Optional[Dict[str, Union[int, float]]] = None
    net_profit_margin: Optional[Dict[str, Union[int, float]]] = None

class RevenueData(BaseModel):
    matched_columns: List[str] = []
    total: Dict[str, float] = {}
    average: Dict[str, float] = {}
    total_revenue_gbp: Optional[float] = None

class ExpenditureData(BaseModel):
    matched_columns: List[str] = []
    total: Dict[str, float] = {}
    average: Dict[str, float] = {}
    total_expenditure_gbp: Optional[float] = None

class ProfitData(BaseModel):
    matched_columns: List[str] = []
    total: Dict[str, float] = {}
    average: Dict[str, float] = {}
    net_profit_margin: Optional[float] = None
    net_income: Optional[float] = None

class DerivedFinancialData(BaseModel):
    profit_per_employee: Optional[float] = None
    revenue_per_employee: Optional[float] = None

class FinancialAIAnalysis(BaseModel):
    comments: List[str] = []
    summaries: Dict[str, str] = {}
    confidence_scores: Optional[Dict[str, float]] = None

class AggregatedFinancialAnalysis(BaseModel):
    numeric_summary: Optional[FinancialNumericSummary] = None
    revenue: Optional[RevenueData] = None
    expenditure: Optional[ExpenditureData] = None
    profit: Optional[ProfitData] = None
    derived: Optional[DerivedFinancialData] = None
    ai_analysis: Optional[FinancialAIAnalysis] = None

class FinancialMetric(BaseModel):
    category: str = "financial"
    file_count: int
    record_count: int
    aggregated_analysis: AggregatedFinancialAnalysis
