// ESG data schema
export interface ESGData {
  company_info: {
    company_name: string | null;
    registration_number: string | null;
    reporting_year_start: string | null;
    reporting_year_end: string | null;
    total_employees: number | null;
    sites: string[]; // or Site[] if you want to link
    industry_sector: string | null;
    headquarters_location: string | null;
    report_prepared_by: string | null;
  };

  financial_data: {
    annual_turnover_gbp: number | null;
    annual_revenue_gbp: number | null;
    annual_operating_costs_gbp: number | null;
    capital_expenditure_gbp: number | null;
  };

  energy_consumption: {
    total_energy_kwh: number | null;
    electricity_kwh: number | null;
    electricity_kwh_by_source: {
      grid_kwh: number | null;
      renewable_kwh: number | null;
      on_site_generation_kwh: number | null;
    };
    natural_gas_kwh: number | null;
    other_fuels_kwh: {
      diesel_kwh: number | null;
      petrol_kwh: number | null;
      lpg_kwh: number | null;
      other_kwh: number | null;
    };
    steam_kwh: number | null;
    heat_kwh: number | null;
    cooling_kwh: number | null;
  };

  emissions: {
    total_emissions_tco2e: number | null;
    scope1_tco2e: {
      stationary_combustion_tco2e: number | null;
      mobile_combustion_tco2e: number | null;
      fugitive_emissions_tco2e: number | null;
    };
    scope2_tco2e: {
      location_based_tco2e: number | null;
      market_based_tco2e: number | null;
    };
    scope3_tco2e: {
      purchased_goods_and_services_tco2e: number | null;
      capital_goods_tco2e: number | null;
      fuel_and_energy_related_activities_tco2e: number | null;
      upstream_transport_tco2e: number | null;
      waste_generated_in_operations_tco2e: number | null;
      business_travel_tco2e: number | null;
      employee_commuting_tco2e: number | null;
      downstream_transport_tco2e: number | null;
      use_of_sold_products_tco2e: number | null;
      end_of_life_treatment_tco2e: number | null;
    };
  };

  intensity_metrics: {
    emissions_per_employee_tco2e: number | null;
    emissions_per_million_gbp_revenue_tco2e: number | null;
    emissions_per_square_meter_tco2e: number | null;
    emissions_per_tonne_output_tco2e: number | null;
  };

  transportation: {
    fleet: {
      total_vehicles: number | null;
      diesel_vehicles: number | null;
      petrol_vehicles: number | null;
      electric_vehicles: number | null;
      hybrid_vehicles: number | null;
      total_distance_travelled_km: number | null;
      fuel_consumption_litres: {
        diesel_litres: number | null;
        petrol_litres: number | null;
        lpg_litres: number | null;
        other_litres: number | null;
      };
    };
    business_travel: {
      air_km: number | null;
      rail_km: number | null;
      car_km: number | null;
      public_transport_km: number | null;
    };
  };

  waste_management: {
    total_waste_tonnes: number | null;
    waste_recycled_tonnes: number | null;
    waste_to_landfill_tonnes: number | null;
    waste_incinerated_tonnes: number | null;
    hazardous_waste_tonnes: number | null;
  };

  water_consumption: {
    total_water_m3: number | null;
    potable_water_m3: number | null;
    non_potable_water_m3: number | null;
    recycled_water_m3: number | null;
  };

  construction_materials: {
    cement_tonnes: number | null;
    steel_tonnes: number | null;
    timber_tonnes: number | null;
    asphalt_tonnes: number | null;
    glass_tonnes: number | null;
    recycled_materials_tonnes: number | null;
  };

  renewable_energy: {
    on_site_solar_kwh: number | null;
    on_site_wind_kwh: number | null;
    purchased_renewable_kwh: number | null;
    renewable_percentage: number | null;
  };

  compliance: {
    reporting_standard: string | null;
    emission_factors_source: string | null;
    verification_status: string | null;
    verification_body: string | null;
  };

  notes: string | null;
}
