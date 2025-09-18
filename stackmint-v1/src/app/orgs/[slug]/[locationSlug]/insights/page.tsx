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
  const { locationSlug } = useParams<{ locationSlug: string }>();
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
    if (!locationSlug) return;
    const fetchSite = async () => {
      const { data, error } = await supabase
        .from("construction_sites")
        .select("*")
        .eq("site_slug", locationSlug)
        .single();
      if (!error) setSite(data);
    };
    fetchSite();
  }, [locationSlug, supabase]);

  // 2. Fetch periods once site is ready
  

  // Fetch aggregate
  useEffect(() => {
    if (!site?.id) return;
    const fetchAggregate = async () => {
      try {
        const res = await fetch(`https://glowing-parakeet-7jqvjqg9xvpcpg5-8001.app.github.dev/sites/${site.id}/aggregate`);
        if (!res.ok) throw new Error("Failed to fetch aggregate data");
        const data = await res.json();
        console.log(data)
        setAggregatedData(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchAggregate();
  }, [site?.id]);


  function sum(obj?: Record<string, number | null | undefined>): number {
    if (!obj) return 0;
    return (Object.values(obj) as (number | null | undefined)[]).reduce<number>(
      (acc, val) => acc + (val ?? 0),
      0
    );
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
      value: aggregatedData?.energy_consumption?.electricity_kwh ?? 0,
    },
    {
      category: "Natural Gas",
      value: aggregatedData?.energy_consumption?.natural_gas_kwh ?? 0,
    },
    {
      category: "Diesel",
      value: aggregatedData?.energy_consumption?.other_fuels_kwh.diesel_kwh ?? 0,
    },
    {
      category: "Petrol",
      value: aggregatedData?.energy_consumption?.other_fuels_kwh.petrol_kwh ?? 0,
    },
    {
      category: "LPG",
      value: aggregatedData?.energy_consumption?.other_fuels_kwh.lpg_kwh ?? 0,
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