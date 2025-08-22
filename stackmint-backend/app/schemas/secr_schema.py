from typing import Optional, List
from pydantic import BaseModel


class CompanyInfo(BaseModel):
    company_name: Optional[str] = None
    registration_number: Optional[str] = None
    reporting_year_start: Optional[str] = None
    reporting_year_end: Optional[str] = None
    total_employees: Optional[int] = None
    sites: List[str] = []
    industry_sector: Optional[str] = None
    headquarters_location: Optional[str] = None
    report_prepared_by: Optional[str] = None


class FinancialData(BaseModel):
    annual_turnover_gbp: Optional[float] = None
    annual_revenue_gbp: Optional[float] = None
    annual_operating_costs_gbp: Optional[float] = None
    capital_expenditure_gbp: Optional[float] = None


class ElectricityBySource(BaseModel):
    grid_kwh: Optional[float] = None
    renewable_kwh: Optional[float] = None
    on_site_generation_kwh: Optional[float] = None


class OtherFuelsKwh(BaseModel):
    diesel_kwh: Optional[float] = None
    petrol_kwh: Optional[float] = None
    lpg_kwh: Optional[float] = None
    other_kwh: Optional[float] = None


class EnergyConsumption(BaseModel):
    total_energy_kwh: Optional[float] = None
    electricity_kwh: Optional[float] = None
    electricity_kwh_by_source: ElectricityBySource = ElectricityBySource()
    natural_gas_kwh: Optional[float] = None
    other_fuels_kwh: OtherFuelsKwh = OtherFuelsKwh()
    steam_kwh: Optional[float] = None
    heat_kwh: Optional[float] = None
    cooling_kwh: Optional[float] = None


class Scope1(BaseModel):
    stationary_combustion_tco2e: Optional[float] = None
    mobile_combustion_tco2e: Optional[float] = None
    fugitive_emissions_tco2e: Optional[float] = None


class Scope2(BaseModel):
    location_based_tco2e: Optional[float] = None
    market_based_tco2e: Optional[float] = None


class Scope3(BaseModel):
    purchased_goods_and_services_tco2e: Optional[float] = None
    capital_goods_tco2e: Optional[float] = None
    fuel_and_energy_related_activities_tco2e: Optional[float] = None
    upstream_transport_tco2e: Optional[float] = None
    waste_generated_in_operations_tco2e: Optional[float] = None
    business_travel_tco2e: Optional[float] = None
    employee_commuting_tco2e: Optional[float] = None
    downstream_transport_tco2e: Optional[float] = None
    use_of_sold_products_tco2e: Optional[float] = None
    end_of_life_treatment_tco2e: Optional[float] = None


class Emissions(BaseModel):
    total_emissions_tco2e: Optional[float] = None
    scope1_tco2e: Scope1 = Scope1()
    scope2_tco2e: Scope2 = Scope2()
    scope3_tco2e: Scope3 = Scope3()


class IntensityMetrics(BaseModel):
    emissions_per_employee_tco2e: Optional[float] = None
    emissions_per_million_gbp_revenue_tco2e: Optional[float] = None
    emissions_per_square_meter_tco2e: Optional[float] = None
    emissions_per_tonne_output_tco2e: Optional[float] = None


class FuelConsumptionLitres(BaseModel):
    diesel_litres: Optional[float] = None
    petrol_litres: Optional[float] = None
    lpg_litres: Optional[float] = None
    other_litres: Optional[float] = None


class Fleet(BaseModel):
    total_vehicles: Optional[int] = None
    diesel_vehicles: Optional[int] = None
    petrol_vehicles: Optional[int] = None
    electric_vehicles: Optional[int] = None
    hybrid_vehicles: Optional[int] = None
    total_distance_travelled_km: Optional[float] = None
    fuel_consumption_litres: FuelConsumptionLitres = FuelConsumptionLitres()


class BusinessTravel(BaseModel):
    air_km: Optional[float] = None
    rail_km: Optional[float] = None
    car_km: Optional[float] = None
    public_transport_km: Optional[float] = None


class Transportation(BaseModel):
    fleet: Fleet = Fleet()
    business_travel: BusinessTravel = BusinessTravel()


class WasteManagement(BaseModel):
    total_waste_tonnes: Optional[float] = None
    waste_recycled_tonnes: Optional[float] = None
    waste_to_landfill_tonnes: Optional[float] = None
    waste_incinerated_tonnes: Optional[float] = None
    hazardous_waste_tonnes: Optional[float] = None


class WaterConsumption(BaseModel):
    total_water_m3: Optional[float] = None
    potable_water_m3: Optional[float] = None
    non_potable_water_m3: Optional[float] = None
    recycled_water_m3: Optional[float] = None


class ConstructionMaterials(BaseModel):
    cement_tonnes: Optional[float] = None
    steel_tonnes: Optional[float] = None
    timber_tonnes: Optional[float] = None
    asphalt_tonnes: Optional[float] = None
    glass_tonnes: Optional[float] = None
    recycled_materials_tonnes: Optional[float] = None


class RenewableEnergy(BaseModel):
    on_site_solar_kwh: Optional[float] = None
    on_site_wind_kwh: Optional[float] = None
    purchased_renewable_kwh: Optional[float] = None
    renewable_percentage: Optional[float] = None


class Compliance(BaseModel):
    reporting_standard: Optional[str] = None
    emission_factors_source: Optional[str] = None
    verification_status: Optional[str] = None
    verification_body: Optional[str] = None


class SecrSchema(BaseModel):
    company_info: CompanyInfo = CompanyInfo()
    financial_data: FinancialData = FinancialData()
    energy_consumption: EnergyConsumption = EnergyConsumption()
    emissions: Emissions = Emissions()
    intensity_metrics: IntensityMetrics = IntensityMetrics()
    transportation: Transportation = Transportation()
    waste_management: WasteManagement = WasteManagement()
    water_consumption: WaterConsumption = WaterConsumption()
    construction_materials: ConstructionMaterials = ConstructionMaterials()
    renewable_energy: RenewableEnergy = RenewableEnergy()
    compliance: Compliance = Compliance()
    notes: Optional[str] = None
