"use client";

import { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useUser, useSession, useOrganization } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
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

type Site = {
  id: string; // Assuming you have an ID field
  site_name: string;
  site_slug: string;
  site_location: string;
};

export default function FileUploader() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [site, setSite] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<Site>();
  const [isUploading, setIsUploading] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();

  const { user } = useUser();
  const { session } = useSession();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setSelectedFile(file);
      setModalOpen(true);
    },
  });

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

  const client = createClerkSupabaseClient();
  const { organization } = useOrganization();

  useEffect(() => {
    if (!organization) return;
    const fetchSites = async () => {
      const { data: siteData, error: siteError } = await client
        .from("construction_sites")
        .select("*")
        .eq("organization_id", organization.id);
      if (siteError) {
        console.error(
          "Error fetching sites something wrong with use Effect:",
          siteError
        );
      } else {
        setSite(siteData || []);
        // Set default selected site to the first one
        if (siteData && siteData.length > 0) {
          setSelectedSite(siteData[0]);
        }
      }
    };
    fetchSites();
  }, [organization, client]);

  const handleUpload = async () => {
    if (!selectedFile || !user || !session || !organization) return;
    console.log(
      "there either user file or session sint present from marvis",
      selectedSite
    );

    setIsUploading(true);

    //const client = createClerkSupabaseClient();

    //const path = `public/${type}/${user.id}_${selectedFile.name}`;
    const safeName = selectedFile.name.replace(/\s+/g, "_");
    const uniqueSuffix = uuidv4()
    const uniqueFileName = `${user.id}_${uniqueSuffix}_${safeName}`;
    const filePath = `${organization.id}/${
      selectedSite?.site_name || "unknown"
    }/${uniqueFileName}`;
    let row_id;

    const metadata = {
      file_name: safeName,
      // I need to change this in the future so that it actually goes to the correct path link
      file_url: filePath,
      user_id: user.id,
      user_name: user.fullName,
      organization_id: organization.id,
      file_site_id: selectedSite?.id,
      start_date: range?.from?.toISOString().slice(0, 10),
      end_date: range?.to?.toISOString().slice(0, 10),     
     };

    const { data, error } = await client.storage
      .from("esg-data-2")
      .upload(filePath, selectedFile, {  // upsert = false if it doesnt work
        contentType: selectedFile.type || "application/octet-stream",
      });

    if (error) {
      console.error("Upload error:", error);
      toast.error(`Upload failed: ${error.message}`);
      setIsUploading(false);
    } else {
      console.log("Upload successful:", data);
      setModalOpen(false);
      setSelectedFile(null);
      toast.success("Succesfully uploaded to database");
      setIsUploading(false);

      console.log("Trying to insert metadata:", metadata);
      const { data: tableData, error: tableError } = await client
        .from("uploaded_esg_files_construction")
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

    try {
      const res = await fetch(" http://localhost:8001/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_url: filePath,
          row_id: row_id,
          category: selectedSite,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Server error:", errorText);
      } else {
        const result = await res.json();
        console.log("Server response (most likely successful):", result);
      }
      // https://ycyfqlehnoruigtrxixc.supabase.co/storage/v1/object/public/esg-data-2/
    } catch (err) {
      console.error("Failed to contact backend (fetch error):", err);
    }
  };

  return (
    <>
      {modalOpen && selectedFile && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Select data type</DialogTitle>
              <DialogDescription>
                Current file: <strong>{selectedFile.name}</strong>
              </DialogDescription>
            </DialogHeader>

            <select
              value={selectedSite?.id || ""}
              onChange={(e) => {
                const selectedId = e.target.value;
                const foundSite = site.find((s) => s.id === selectedId);
                setSelectedSite(foundSite);
                console.log(
                  "this is to see if it actyally finds the iste",
                  foundSite
                );
              }}
              className="w-full border rounded p-2 mt-2"
            >
              {site.map((sites) => (
                <option key={sites.id} value={sites.id}>
                  {sites.site_name}
                </option>
              ))}
            </select>

            <Calendar23 range={range} setRange={setRange} />

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
          <DataTableDemo />
        </div>
      </section>
    </>
  );
}
