"use client";

import { useState, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { useUser, useSession, useOrganization } from "@clerk/nextjs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DataTableDemo } from "@/components/file-table";
import { Calendar23 } from "@/components/calendar-23";
import { type DateRange } from "react-day-picker";
import { v4 as uuidv4 } from "uuid";
import { useParams } from "next/navigation";
import { createClerkSupabaseClient } from "@/lib/supabase-client";
import { activityTypes } from "@/lib/activity_types_schema";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export default function FileUploader() {
  const { locationId } = useParams<{ locationId: string }>();
  const { user } = useUser();
  const { session } = useSession();
  const { organization } = useOrganization();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activityType, setActivityType] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setSelectedFile(file);
      setModalOpen(true);
    },
  });

  const supabase = useMemo(
    () =>
      createClerkSupabaseClient(
        () => session?.getToken?.() ?? Promise.resolve(null),
      ),
    [session],
  );

  // useEffect(() => {
  //   if (!organization) return;
  //   const fetchSites = async () => {
  //     const { data: siteData, error: siteError } = await supabase
  //       .from("construction_sites")
  //       .select("*")
  //       .eq("organization_id", organization.id)
  //       .eq("site_slug", locationSlug);
  //     if (siteError) {
  //       console.error(
  //         "Error fetching sites something wrong with use Effect:",
  //         siteError,
  //       );
  //     } else {
  //       setSite(siteData ? siteData[0] : undefined); // since we are only fetching one site based on the slug
  //       console.log("Fetched sites:", siteData);
  //       // Set default selected site to the first one
  //       if (siteData && siteData.length > 0) {
  //         setSelectedSite(siteData[0]);
  //       }
  //     }
  //   };
  //   fetchSites();
  // }, [organization, supabase]);

  const handleUpload = async () => {
    if (!selectedFile || !user || !session || !organization) return;
    console.log(
      "there either user file or session isnt present from marvis",
      //selectedSite
    );

    setIsUploading(true);

    let resolvedOrganizationId = organization.id;
    if (!isUuid(resolvedOrganizationId)) {
      const { data: orgRow } = await supabase
        .from("clerk_organisations")
        .select("id")
        .eq("clerk_org_id", organization.id)
        .maybeSingle();

      if (!orgRow?.id) {
        toast.error("Could not resolve organization UUID for upload.");
        setIsUploading(false);
        return;
      }

      resolvedOrganizationId = orgRow.id;
    }

    const resolvedUploadedBy = isUuid(user.id)
      ? user.id
      : resolvedOrganizationId;
    //const path = `public/${type}/${user.id}_${selectedFile.name}`;
    const safeName = selectedFile.name.replace(/\s+/g, "_");
    const uniqueSuffix = uuidv4();
    const uniqueFileName = `${user.id}_${uniqueSuffix}_${safeName}`;
    const filePath = `${organization.id}/${
      locationId || "unknown"
    }/${uniqueFileName}`;

    let row_id;

    const metadata = {
      file_name: safeName,
      // I need to change this in the future so that it actually goes to the correct path link
      storage_path: filePath,
      //public_file_url: publicUrlData?.publicUrl ?? null,
      uploaded_by: resolvedUploadedBy,
      file_type: selectedFile.type,
      user_name: user.fullName,
      organization_id: resolvedOrganizationId,
      //file_site_id: site?.id, // this was originally selectedSite?.id ive changed to just Site
      //start_date: range?.from?.toISOString().slice(0, 10),
      //end_date: range?.to?.toISOString().slice(0, 10),
      activity_type: activityType,
      upload_method: "manual",
      uploaded_at: new Date().toISOString(),
      parsing_status: "pending",
      // i need this so i know where each file comes from etc.
      company_location_id: locationId,
    };

    const { error } = await supabase.storage
      .from("esg-data-2")
      .upload(filePath, selectedFile, {
        // upsert = false if it doesnt work
        contentType: selectedFile.type || "application/octet-stream",
      });
    console.log("MIME TYPE:", selectedFile.type);

    if (error) {
      console.error("Upload error:", error);
      toast.error(`Upload failed: ${error.message}`);
      setIsUploading(false);
    } else {
      setModalOpen(false);
      setSelectedFile(null);
      toast.success("Succesfully uploaded to database");
      setIsUploading(false);

      console.log("Trying to insert metadata:", metadata);
      const { data: tableData, error: tableError } = await supabase
        .from("company_raw_uploads")
        .insert([metadata])
        .select();

      if (tableError) {
        console.error("Insert error message:", tableError);
        toast.error(`Insert failed: ${tableError.message}`);
      } else {
        console.log(tableData);
        row_id = tableData[0]?.id;
        console.log("Insert successful, row ID:", row_id);
      }
    }
  };

  //   try {
  //     const res = await fetch(
  //       "https://glowing-parakeet-7jqvjqg9xvpcpg5-8001.app.github.dev/analyze",
  //       {
  //         method: "POST",
  //         headers: {
  //           "Content-Type": "application/json",
  //         },
  //         body: JSON.stringify({
  //           file_url: filePath,
  //           row_id: row_id,
  //           category: site,
  //         }),
  //       },
  //     );

  //     if (!res.ok) {
  //       const errorText = await res.text();
  //       console.error("Server error:", errorText);
  //     } else {
  //       const result = await res.json();
  //       console.log("Server response (most likely successful):", result);
  //     }
  //     // https://ycyfqlehnoruigtrxixc.supabase.co/storage/v1/object/public/esg-data-2/
  //   } catch (err) {
  //     console.error("Failed to contact backend (fetch error):", err);
  //   }
  // };

  return (
    <>
      {modalOpen && selectedFile && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Select Activity type</DialogTitle>
              <DialogDescription>
                Current file: <strong>{selectedFile.name}</strong>
              </DialogDescription>
            </DialogHeader>

            {/* select activity type */}
            <label className="block mt-4">
              <span className="text-gray-700">Activity type</span>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value)}
                className="w-full border rounded p-2 mt-1"
              >
                <option value="" disabled>
                  -- choose an activity --
                </option>
                {activityTypes.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <p className="text-sm text-gray-500 mt-1">
                {
                  activityTypes.find((a) => a.value === activityType)
                    ?.description
                }
              </p>
            </label>

            {/* <Calendar23 range={range} setRange={setRange} /> */}

            <Button
              className="mt-4 w-full"
              onClick={handleUpload}
              disabled={isUploading}
            >
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogContent>
        </Dialog>
      )}

      <section className="container mx-auto max-w-xl p-4">
        <div
          {...getRootProps()}
          className={`flex flex-col items-center justify-center border-2 border-dotted rounded-lg bg-gray-100 transition-colors duration-200
            ${isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-400"}
            min-h-[180px] w-full cursor-pointer p-6`}
        >
          <input {...getInputProps()} />
          <p className="text-gray-600 text-center">
            Drag & drop a file here, or click to select one
          </p>
        </div>

        <aside className="mt-6">
          <h4 className="font-semibold mb-2">Files</h4>
          <ul className="list-disc list-inside text-gray-700">
            {selectedFile ? (
              <li>{selectedFile.name}</li>
            ) : (
              <li>No files uploaded yet</li>
            )}
          </ul>
        </aside>
      </section>
      <section>
        <div className="container mx-auto py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">File Management</h1>
            <p className="text-muted-foreground">
              Manage and view your uploaded files
              {/* Only admins can select and delete files */}
            </p>
          </div>
          {/* Replace "your_table_name" with your actual Supabase table name */}
          <DataTableDemo
            organizationId={organization?.id!}
            locationId={locationId}
          />
        </div>
      </section>
    </>
  );
}
