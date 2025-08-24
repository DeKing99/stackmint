"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSession } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import { type ESGData } from "@/lib/data_schemas_test";
import {
  Card,
  //CardAction,
  CardDescription,
 // CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Site = {
  id: string;
  site_name: string;
  site_slug: string;
  site_location: string;
};

export default function SitesPage() {
  const { siteslug } = useParams<{ siteslug: string }>();
  const { session } = useSession();
  const [site, setSite] = useState<Site | null>(null); // store just ONE site instead of array
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

  // Fetch the site once
  useEffect(() => {
    if (!siteslug) return;
    const fetchSite = async () => {
      const { data, error } = await supabase
        .from("construction_sites")
        .select("*")
        .eq("site_slug", siteslug)
        .single(); // we only expect 1 site

      if (error) {
        console.error("Error fetching site:", error);
      } else {
        setSite(data);
      }
    };

    fetchSite();
  }, [siteslug, supabase]); // removed `supabase` to avoid re-creation loop

  // Fetch aggregate once site.id is known
  useEffect(() => {
    if (!site?.id) return;

    const fetchAggregate = async () => {
      try {
        const res = await fetch(`http://localhost:8001/sites/${site.id}/aggregate`);
        if (!res.ok) throw new Error("Failed to fetch aggregate data");
        const data = await res.json();
        console.log("Aggregate data:", data);
        setAggregatedData(data);
      } catch (err) {
        console.error("There was an unexpected error: ", err);
      }
    };

    fetchAggregate();
  }, [site?.id]); // ✅ only runs when site.id changes

    
    function sum(obj?: Record<string, number>): number {
    if (!obj) return 0;
    return Object.values(obj).reduce((acc, val) => acc + (typeof val === "number" ? val : 0), 0);
    }

  const scope1_total = sum(
    aggregatedData?.emissions?.scope1_tco2e
      ? Object.fromEntries(
          Object.entries(aggregatedData.emissions.scope1_tco2e).map(([k, v]) => [k, v ?? 0])
        )
      : undefined
    );
    const scope2_total = sum(
    aggregatedData?.emissions?.scope1_tco2e
      ? Object.fromEntries(
          Object.entries(aggregatedData.emissions.scope1_tco2e).map(([k, v]) => [k, v ?? 0])
        )
      : undefined
    );
    const scope3_total = sum(
    aggregatedData?.emissions?.scope1_tco2e
      ? Object.fromEntries(
          Object.entries(aggregatedData.emissions.scope1_tco2e).map(([k, v]) => [k, v ?? 0])
        )
      : undefined
  );

  return (
    <>
      <h1>{site?.site_name}</h1>
      <p>{site?.site_location}</p>
      <Card>
        <CardHeader>
          <CardDescription>Scope 1 Emissions tCO2e</CardDescription>
          <CardTitle className="tabular-nums text-2xl">
            {" "}
            {scope1_total ?? "Loading..."}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Scope 2 Emissions tCO2e</CardDescription>
          <CardTitle className="tabular-nums text-2xl">
            {" "}
            {scope2_total ?? "Loading..."}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Scope 3 Emissions tCO2e</CardDescription>
          <CardTitle className="tabular-nums text-2xl">
            {" "}
            {scope3_total ?? "Loading..."}
          </CardTitle>
        </CardHeader>
      </Card>
    </>
  );
}
