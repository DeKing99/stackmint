"use client"

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@supabase/supabase-js";
import { useSession, useOrganization } from "@clerk/nextjs";
import { MapPinned, ChevronRight } from "lucide-react"
import { useRouter, useParams } from "next/navigation";
//import { useSession } from "@clerk/clerk-react"; // Ensure you have Clerk set up for authentication
//import { supabase } from "@/lib/supabaseClient"; // Adjust path based on your setup

type Report = {
  id: string; // Assuming you have an ID field
  report_name: string;
  report_slug: string;
  report_location: string;
}

export default function SitesPage() {

  const { locationSlug } = useParams<{ locationSlug: string }>();
  const [modalOpen, setModalOpen] = useState(false);
  const [reportName, setReportName] = useState("");
  //const [siteLocation, setSiteLocation] = useState("");
  const siteLocation = locationSlug;
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [reports, setReports] = useState<Report[]>([]); // Replace `any` with your Site type


  const { session } = useSession();
  const { organization } = useOrganization();
  const router = useRouter();
  
  
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

  // Slug generator
  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "");
  }

  // Create new site
  const handleCreateReport = async () => {
    if (!reportName || !siteLocation) return;

    setIsCreatingReport(true);

    const slug = generateSlug(reportName);
    const { data, error } = await supabase
      .from("construction_sites_reports") // replace with your actual table name
      .insert([
        {
          report_name: reportName,
          report_slug: slug,
          report_location: siteLocation,
          organization_id: organization?.id, // Assuming you have an organization ID
          created_by: session?.user.id, // Assuming you have a user ID from Clerk
        },
      ]);
    // Log the data and error for debugging
    console.log("Creating report with data:", reportName, slug, siteLocation, organization?.id, session?.user.id)
    if (error) {
      console.error("Error creating report:", error);
    } else {
      console.log("Report created:", data);
      setReports((prev) => [...prev, ...(data || [])]);
    }

    setIsCreatingReport(false);
    setModalOpen(false);
    setReportName("");
    //setSiteLocation("");
  };

  // Fetch existing sites
  useEffect(() => {
    if (!organization) return;
    const fetchReports = async () => {

      //console.log("Organization id", organization)
      const { data, error } = await supabase.from("construction_sites_reports").select("*").eq("organization_id", organization?.id).eq("report_location", locationSlug);

      if (error) {
        console.error("Error fetching reports:", error);
      } else {
        setReports(data || []);
      }
    };

    fetchReports();
  }, [supabase, organization])


  

  return (
    <>
      <Button
        className="px-4 py-2 text-sm font-medium text-white rounded-lg"
        onClick={() => setModalOpen(true)}
      >
        Create new Report
      </Button>

      {modalOpen && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new Report</DialogTitle>
              <DialogDescription>
                Enter the report name below.
              </DialogDescription>
            </DialogHeader>

            <input
              type="text"
              placeholder="Enter Name of Report"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              className="w-full border rounded p-2 mt-2"
            />

            {/* <input
              type="text"
              placeholder="Enter site location"
              value={siteLocation}
              onChange={(e) => setSiteLocation(e.target.value)}
              className="w-full border rounded p-2 mt-2"
            /> */}
            {/* here we dont actually need to have the user select the location for the report because the app is now modular with restrcited acccess */}

            <Button
              className="mt-4 w-full"
              onClick={handleCreateReport}
              disabled={isCreatingReport}
            >
              {isCreatingReport ? "Creating Report..." : "Create Report"}
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {/* Display list of created reports */}
      <div className="mt-8 space-y-6">
        <div className="mt-8 space-y-4">
          <h2 className="text-xl">Reports</h2>

          {reports.length === 0 && (
            <p className="text-sm text-muted-foreground">No reports yet.</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((report) => (
              <button
                key={report.id}
                   onClick={() => router.push(`/orgs/${organization?.slug}/${siteLocation}/reports/${report.report_slug}`)} // handle navigation here
                //={() => router.push(`/${report.report_slug}`)} // handle navigation here
                className="group relative flex flex-col justify-between border rounded-xl p-6 bg-white shadow-sm hover:shadow-md transition-all text-left w-full h-40 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <div>
                  <p className="text-lg text-muted-foreground">
                    {report.report_name} <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-hover:text-primary transition-colors" />
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 flex items-center">
                    <MapPinned className="inline-block mr-1 h-4 w-4" />
                    {report.report_location}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
