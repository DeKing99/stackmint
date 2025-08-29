"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSession } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import { type ESGData } from "@/lib/data_schemas_test";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartRadarGridCircle } from "@/components/chart-radar-grid-circle";
import { ElectricityBarChart } from "@/components/chart-bar-active";
import { ChartPieLegend } from "@/components/chart-pie-legend";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

type Site = {
  id: string;
  site_name: string;
  site_slug: string;
  site_location: string;
};
type Period = { label: string; value: string };

export default function SitesPage() {
  const { siteslug } = useParams<{ siteslug: string }>();
  const { session } = useSession();
  const [site, setSite] = useState<Site | null>(null);
  //const [workerNumber, setWorkerNumber] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [availablePeriods, setAvailablePeriods] = useState<Period[]>([]);
  //const [processedData, setProcessedData] = useState<ESGData[] | null>(null);
  const [aggregatedData, setAggregatedData] = useState<ESGData>();

  function createClerkSupabaseClient() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        async accessToken() {
          return session?.getToken() ?? null;
        },
      }
    );
  }

  const supabase = createClerkSupabaseClient();

  // Fetch site
  // 1. Fetch site
  useEffect(() => {
    if (!siteslug) return;
    const fetchSite = async () => {
      const { data, error } = await supabase
        .from("construction_sites")
        .select("*")
        .eq("site_slug", siteslug)
        .single();
      if (!error) setSite(data);
    };
    fetchSite();
  }, [siteslug, supabase]);

  // 2. Fetch periods once site is ready
  useEffect(() => {
    if (!site?.id) return;
    const fetchDates = async () => {
      const { data: DatesData, error } = await supabase
        .from("uploaded_esg_files_consruction")
        .select("start_date, end_date")
        .eq("file_site_id", site.id);

      if (error) {
        console.error(error);
        return;
      }

      const periods = DatesData.map((row) => ({
        label: `${new Date(row.start_date).toLocaleDateString("en-GB", {
          month: "short",
          year: "numeric",
        })} – ${new Date(row.end_date).toLocaleDateString("en-GB", {
          month: "short",
          year: "numeric",
        })}`,
        value: `${row.start_date}|${row.end_date}`,
      }));

      setAvailablePeriods([{ label: "All", value: "all" }, ...periods]);
      setSelectedPeriod("all"); // default
    };

    fetchDates();
  }, [site?.id, supabase]);

  // Fetch aggregate
  useEffect(() => {
    if (!site?.id) return;
    const fetchAggregate = async () => {
      try {
        const res = await fetch(
          `http://localhost:8001/sites/${site.id}/aggregate`
        );
        if (!res.ok) throw new Error("Failed to fetch aggregate data");
        const data = await res.json();
        setAggregatedData(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchAggregate();
  }, [site?.id]);

  useEffect(() => {
    if (!site?.id || !selectedPeriod) return;

    // Case 1: "All" -> fetch aggregate
    if (selectedPeriod === "all") {
      const fetchAggregate = async () => {
        try {
          const res = await fetch(
            `http://localhost:8001/sites/${site.id}/aggregate`
          );
          if (!res.ok) throw new Error("Failed to fetch aggregate data");
          const data = await res.json();
          setAggregatedData(data);
          //setProcessedData(null); // reset processed
        } catch (err) {
          console.error(err);
        }
      };
      fetchAggregate();
      return;
    }

    // Case 2: Specific period -> fetch processed
    const fetchProcessed = async () => {
      const [start, end] = selectedPeriod.split("|"); // parse "2023-01-01|2023-12-31"

      // Step 1: get uploads that fall within selected period
      const { data: uploads, error: uploadsError } = await supabase
        .from("uploaded_esg_files_consruction")
        .select("id")
        .eq("file_site_id", site.id)
        .gte("start_date", start)
        .lte("end_date", end);

      if (uploadsError) {
        console.error(uploadsError);
        return;
      }

      // if (!uploads || uploads.length === 0) {
      //   setProcessedData([]);
      //   return;
      // }

      const uploadIds = uploads.map((u) => u.id);

      // Step 2: get processed files linked to those uploads
      const { data: processed, error: processedError } = await supabase
        .from("processed_esg_files")
        .select("*")
        .in("original_file_id", uploadIds);

      if (processedError) {
        console.error(processedError);
        return;
      }

      if (processed && processed.length > 0) {
        const aggregated = aggregateProcessed(processed);
        setAggregatedData(aggregated);
      } else {
        setAggregatedData(undefined);
      }
    };

    fetchProcessed();
  }, [selectedPeriod, site?.id, supabase]);

  // helpers
  function sum(obj?: Record<string, number | null | undefined>): number {
    if (!obj) return 0;
    return (Object.values(obj) as (number | null | undefined)[]).reduce<number>(
      (acc, val) => acc + (val ?? 0),
      0
    );
  }

  // NEW: aggregate a list of processed ESGData into one aggregated ESGData
  function aggregateProcessed(data: ESGData[]): ESGData {  
    const agg: ESGData = {
      emissions: {
        scope1_tco2e: {
          stationary_combustion_tco2e: 0,
          mobile_combustion_tco2e: 0,
          fugitive_emissions_tco2e: 0,
        },
        scope2_tco2e: {
          location_based_tco2e: 0,
          market_based_tco2e: 0
        },
        scope3_tco2e: {
          purchased_goods_and_services_tco2e: 0,
          capital_goods_tco2e: 0,
          fuel_and_energy_related_activities_tco2e: 0,
          upstream_transport_tco2e: 0,
          waste_generated_in_operations_tco2e: 0,
          business_travel_tco2e: 0,
          employee_commuting_tco2e: 0,
          downstream_transport_tco2e: 0,
          use_of_sold_products_tco2e: 0,
          end_of_life_treatment_tco2e: 0,
        },
        total_emissions_tco2e: 0,
      },
      energy_consumption: {
        electricity_kwh: 0,
        natural_gas_kwh: 0,
        other_fuels_kwh: {
          diesel_kwh: 0,
          petrol_kwh: 0,
          lpg_kwh: 0,
          other_kwh: 0,
        },
        electricity_kwh_by_source: {
          grid_kwh: 0,
          renewable_kwh: 0,
          on_site_generation_kwh: 0,
        },
        total_energy_kwh: 0,
        steam_kwh: 0,
        heat_kwh: 0,
        cooling_kwh: 0
      },
      company_info: {
        company_name: "",
        registration_number: "",
        reporting_year_start: "",
        reporting_year_end: null,
        total_employees: 0,
        sites: [],
        industry_sector: null,
        headquarters_location: null,
        report_prepared_by: null
      },
      financial_data: {
        annual_turnover_gbp: 0,
        annual_revenue_gbp: 0,
        annual_operating_costs_gbp: 0,
        capital_expenditure_gbp: 0
      },
      intensity_metrics: {
        emissions_per_employee_tco2e: 0,
        emissions_per_million_gbp_revenue_tco2e: 0,
        emissions_per_square_meter_tco2e: 0,
        emissions_per_tonne_output_tco2e: 0
      },
      transportation: {
        fleet: {
          total_vehicles: 0,
          diesel_vehicles: 0,
          petrol_vehicles: 0,
          electric_vehicles: 0,
          hybrid_vehicles: 0,
          total_distance_travelled_km: 0,
          fuel_consumption_litres: {
            diesel_litres: 0,
            petrol_litres: 0,
            lpg_litres: 0,
            other_litres: 0
          }
        },
        business_travel: {
          air_km: 0,
          rail_km: 0,
          car_km: 0,
          public_transport_km: 0
        }
      },
      waste_management: {
        total_waste_tonnes: 0,
        waste_recycled_tonnes: 0,
        waste_to_landfill_tonnes: 0,
        waste_incinerated_tonnes: 0,
        hazardous_waste_tonnes: 0
      },
      water_consumption: {
        total_water_m3: null,
        potable_water_m3: null,
        non_potable_water_m3: null,
        recycled_water_m3: null
      },
      construction_materials: {
        cement_tonnes: null,
        steel_tonnes: null,
        timber_tonnes: null,
        asphalt_tonnes: null,
        glass_tonnes: null,
        recycled_materials_tonnes: null
      },
      renewable_energy: {
        on_site_solar_kwh: null,
        on_site_wind_kwh: null,
        purchased_renewable_kwh: null,
        renewable_percentage: null
      },
      compliance: {
        reporting_standard: null,
        emission_factors_source: null,
        verification_status: null,
        verification_body: null
      },
      notes: null
    };

    type Scope1Keys = keyof ESGData["emissions"]["scope1_tco2e"];
    type Scope2Keys = keyof ESGData["emissions"]["scope2_tco2e"];
    type Scope3Keys = keyof ESGData["emissions"]["scope3_tco2e"];

    for (const row of data) {
      // --- Emissions ---
      for (const [k, v] of Object.entries(row.emissions?.scope1_tco2e ?? {})) {
        const key = k as Scope1Keys;
        agg.emissions.scope1_tco2e[key] = (agg.emissions.scope1_tco2e[key] ?? 0) + (v ?? 0);
      }
      for (const [k, v] of Object.entries(row.emissions?.scope2_tco2e ?? {})) {
        const key = k as Scope2Keys;
        agg.emissions.scope2_tco2e[key] =
          (agg.emissions.scope2_tco2e[key] ?? 0) + (v ?? 0);
      }
      for (const [k, v] of Object.entries(row.emissions?.scope3_tco2e ?? {})) {
        const key = k as Scope3Keys;
        agg.emissions.scope3_tco2e[key] =
          (agg.emissions.scope3_tco2e[key] ?? 0) + (v ?? 0);
      }


      // --- Energy ---
      agg.energy_consumption.electricity_kwh = (agg.energy_consumption.electricity_kwh ?? 0 )+ (row.energy_consumption?.electricity_kwh ?? 0);
      agg.energy_consumption.natural_gas_kwh = (agg.energy_consumption.natural_gas_kwh ?? 0) + (row.energy_consumption?.natural_gas_kwh ?? 0);
      agg.energy_consumption.other_fuels_kwh.diesel_kwh = (agg.energy_consumption.other_fuels_kwh.diesel_kwh ?? 0) + (row.energy_consumption?.other_fuels_kwh?.diesel_kwh ?? 0);
      agg.energy_consumption.other_fuels_kwh.petrol_kwh = (agg.energy_consumption.other_fuels_kwh.petrol_kwh ?? 0) + (row.energy_consumption?.other_fuels_kwh?.petrol_kwh ?? 0);
      agg.energy_consumption.other_fuels_kwh.lpg_kwh = (agg.energy_consumption.other_fuels_kwh.lpg_kwh ?? 0) + (row.energy_consumption?.other_fuels_kwh?.lpg_kwh ?? 0);
      agg.energy_consumption.electricity_kwh_by_source.grid_kwh = (agg.energy_consumption.electricity_kwh_by_source.grid_kwh ?? 0)+ (row.energy_consumption?.electricity_kwh_by_source?.grid_kwh ?? 0);
      agg.energy_consumption.electricity_kwh_by_source.renewable_kwh = (agg.energy_consumption.electricity_kwh_by_source.renewable_kwh ?? 0) + (row.energy_consumption?.electricity_kwh_by_source?.renewable_kwh ?? 0);
      agg.energy_consumption.electricity_kwh_by_source.on_site_generation_kwh = (agg.energy_consumption.electricity_kwh_by_source.on_site_generation_kwh ?? 0) + (row.energy_consumption?.electricity_kwh_by_source?.on_site_generation_kwh ?? 0);
    }

    return agg;
  }

  const scope1_total = sum(
    aggregatedData?.emissions?.scope1_tco2e
  );
  const scope2_total = sum(
    aggregatedData?.emissions?.scope2_tco2e
  );
  const scope3_total = sum(
    aggregatedData?.emissions?.scope3_tco2e
  );

  // const handleWorkerNumberChange = () => {
  //   const newWorkerNumber = prompt(
  //     "Enter the number of workers:",
  //     workerNumber.toString()
  //   );
  //   if (newWorkerNumber !== null) {
  //     const parsedNumber = parseInt(newWorkerNumber, 10);
  //     if (!isNaN(parsedNumber)) setWorkerNumber(parsedNumber);
  //   }
  // };

  const energyData = [
    {
      category: "Electricity",
      value: aggregatedData?.energy_consumption.electricity_kwh ?? 0,
    },
    {
      category: "Natural Gas",
      value: aggregatedData?.energy_consumption.natural_gas_kwh ?? 0,
    },
    {
      category: "Diesel",
      value: aggregatedData?.energy_consumption.other_fuels_kwh.diesel_kwh ?? 0,
    },
    {
      category: "Petrol",
      value: aggregatedData?.energy_consumption.other_fuels_kwh.petrol_kwh ?? 0,
    },
    {
      category: "LPG",
      value: aggregatedData?.energy_consumption.other_fuels_kwh.lpg_kwh ?? 0,
    },
  ];

  const constructionMaterialData = [
    { material: "Cemment", tonnes: aggregatedData?.construction_materials?.cement_tonnes ?? 0 },
    { material: "Steel", tonnes: aggregatedData?.construction_materials?.steel_tonnes ?? 0 },
    { material: "Timber", tonnes: aggregatedData?.construction_materials?.timber_tonnes ?? 0 },
    { material: "Asphalt", tonnes: aggregatedData?.construction_materials?.asphalt_tonnes ?? 0 },
    { material: "Glass", tonnes: aggregatedData?.construction_materials?.glass_tonnes ?? 0 },
    { material: "Recycled Materials", tonnes: aggregatedData?.construction_materials?.recycled_materials_tonnes ?? 0 },
  ];

  return (
    <div className="space-y-8 p-6">
      {/* Header row */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{site?.site_name}</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              {selectedPeriod || "Select Period"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Choose Reporting Period</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={selectedPeriod}
              onValueChange={(value) => setSelectedPeriod(value)}
            >
              {availablePeriods.map((period) => (
                <DropdownMenuRadioItem key={period.value} value={period.value}>
                  {period.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-lg text-muted-foreground">{site?.site_location}</p>
      </div>

      {/* Row 1: Scope cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardDescription>Scope 1 Emissions (tCO2e)</CardDescription>
            <CardTitle className="tabular-nums text-2xl">
              {scope1_total ?? "Loading..."}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Scope 2 Emissions (tCO2e)</CardDescription>
            <CardTitle className="tabular-nums text-2xl">
              {scope2_total ?? "Loading..."}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Scope 3 Emissions (tCO2e)</CardDescription>
            <CardTitle className="tabular-nums text-2xl">
              {scope3_total ?? "Loading..."}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Row 2: Bar chart full width */}
      <div className="w-full">
        <ElectricityBarChart
          grid_kwh={
            aggregatedData?.energy_consumption?.electricity_kwh_by_source
              ?.grid_kwh ?? 0
          }
          renewable_kwh={
            aggregatedData?.energy_consumption?.electricity_kwh_by_source
              ?.renewable_kwh ?? 0
          }
          on_site_generation_kwh={
            aggregatedData?.energy_consumption?.electricity_kwh_by_source
              ?.on_site_generation_kwh ?? 0
          }
        />
      </div>

      {/* Row 3: Radar + Pie side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartRadarGridCircle
          title="Energy Consumption by Source"
          description="Energy usage in kWh"
          data={energyData}
          dataKey="value"
          angleKey="category"
        />
        <ChartPieLegend
          title="Construction Materials"
          description="Material usage in tonnes"
          data={constructionMaterialData}
          dataKey="value"
          nameKey="material"
        />
      </div>
    </div>
  );
}
