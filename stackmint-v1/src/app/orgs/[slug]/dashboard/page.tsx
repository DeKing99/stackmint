// app/orgs/[slug]/dashboard/page.tsx
// 'use client';
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable } from "@/components/data-table";
import { SectionCards } from "@/components/section-cards";
//import { embedDashboard } from "@superset-ui/embedded-sdk";
//import { useEffect, useRef } from "react";

import data from "./data.json";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await params;
  const { userId } = await auth();

  if (!userId) return redirect("/sign-in");

  return (
    <>
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <SectionCards />
            <div className="px-4 lg:px-6">
              <ChartAreaInteractive />
            </div>
            <DataTable data={data} />
          </div>
        </div>
      </div>
    </>
  );
}

// export default function DashboardPage() {
//   const dashboardRef = useRef<HTMLDivElement>(null);

//   useEffect(() => {
//     if (!dashboardRef.current) return;

//     const guestToken = process.env.NEXT_PUBLIC_SUPERSET_GUEST_TOKEN;

//     if (!guestToken) {
//       console.error("Superset guest token is missing");
//       return;
//     }

//     embedDashboard({
//       id: "4ab5fe6b-25a9-4b4b-ac37-04f397d31634",

//       supersetDomain: "http://46.225.55.130",

//       mountPoint: dashboardRef.current,

//       fetchGuestToken: async () => guestToken,

//       dashboardUiConfig: {
//         hideTitle: true,
//         hideTab: false,
//         hideChartControls: false,
//         filters: {
//           visible: true,
//           expanded: false,
//         },
//       },
//     });
//   }, []);

//   return (
//     <main className="min-h-screen">
//       <div ref={dashboardRef} className="w-full min-h-screen" />
//     </main>
//   );
// }