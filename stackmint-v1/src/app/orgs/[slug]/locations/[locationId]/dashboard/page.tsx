
// app/orgs/[slug]/[locationSlug]/dashboard/page.tsx
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { DataTable } from "@/components/data-table"
import { SectionCards } from "@/components/section-cards"

import data from "./data.json"


export default async function DashboardPage({ params }: { params: Promise<{ locationSlug: string }> }) {
  const { locationSlug } = await params;
  //const { locationSlug } = useParams<{ locationSlug: string }>();
  const { userId, orgSlug } = await auth();

  if (!userId) return redirect('/sign-in');

  // If current orgSlug doesn't match URL slug, ask user to switch
  // if (!orgSlug || orgSlug !== locationSlug) {
  //   return redirect(`/orgs/${orgSlug}/headquarters/dashboard`);
  // }

  return (
    <>
      <div className="flex flex-1 flex-col">
        <h1>{locationSlug}</h1>
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
