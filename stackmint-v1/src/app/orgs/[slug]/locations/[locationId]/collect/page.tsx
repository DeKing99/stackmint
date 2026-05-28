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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { DataTableDemo } from "../../../../../../components/file-table";
import { v4 as uuidv4 } from "uuid";
import { useParams } from "next/navigation";
import { createClerkSupabaseClient } from "@/lib/supabase-client";
import { activityTypes } from "@/lib/activity_types_schema";
import {
  ChevronDown,
  SlidersHorizontal,
  Sparkles,
  CheckCircle,
  XCircle,
} from "lucide-react";

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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [enterpriseInputs, setEnterpriseInputs] = useState({
    reportingPeriod: "",
    supplier: "",
    department: "",
    spendAmount: "",
    invoiceNumber: "",
    category: "",
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setActivityType("");
      setShowAdvanced(false);
      setEnterpriseInputs({
        reportingPeriod: "",
        supplier: "",
        department: "",
        spendAmount: "",
        invoiceNumber: "",
        category: "",
      });
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

    const parsedSpendAmount = Number.parseFloat(enterpriseInputs.spendAmount);
    const uploadEnterpriseInputs = {
      reporting_period: enterpriseInputs.reportingPeriod.trim() || undefined,
      supplier: enterpriseInputs.supplier.trim() || undefined,
      department: enterpriseInputs.department.trim() || undefined,
      spend_amount: Number.isFinite(parsedSpendAmount)
        ? parsedSpendAmount
        : undefined,
      invoice_number: enterpriseInputs.invoiceNumber.trim() || undefined,
      category: enterpriseInputs.category.trim() || undefined,
    };
    const hasEnterpriseInputs = Object.values(uploadEnterpriseInputs).some(
      (v) => v !== undefined,
    );

    const metadata = {
      file_name: safeName,
      // I need to change this in the future so that it actually goes to the correct path link
      storage_path: filePath,
      //public_file_url: publicUrlData?.publicUrl ?? null,
      uploaded_by: resolvedUploadedBy,
      file_type: selectedFile.type,
      organization_id: resolvedOrganizationId,
      //file_site_id: site?.id, // this was originally selectedSite?.id ive changed to just Site
      //start_date: range?.from?.toISOString().slice(0, 10),
      //end_date: range?.to?.toISOString().slice(0, 10),
      activity_type: activityType || null,
      upload_method: "manual",
      uploaded_at: new Date().toISOString(),
      parsing_status: "pending",
      // i need this so i know where each file comes from etc.
      company_location_id: locationId,
      ...(hasEnterpriseInputs
        ? {
            parsing_stage_summary: {
              enterprise_inputs: uploadEnterpriseInputs,
            },
          }
        : {}),
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
      setUploadStatus("error");
      toast.error(`Upload failed: ${error.message}`);
      setIsUploading(false);
      setTimeout(() => setUploadStatus("idle"), 3000);
    } else {
      setModalOpen(false);
      setSelectedFile(null);
      setIsUploading(false);

      console.log("Trying to insert metadata:", metadata);
      const { data: tableData, error: tableError } = await supabase
        .from("company_raw_uploads")
        .insert([metadata])
        .select();

      if (tableError) {
        console.error("Insert error message:", tableError);
        setUploadStatus("error");
        toast.error(`Insert failed: ${tableError.message}`);
        setTimeout(() => setUploadStatus("idle"), 3000);
      } else {
        console.log(tableData);
        const row_id = tableData[0]?.id;
        console.log("Insert successful, row ID:", row_id);
        setUploadStatus("success");
        setRefreshTrigger((prev) => prev + 1);
        setTimeout(() => setUploadStatus("idle"), 3000);
        toast.success(
          activityType
            ? "Upload queued with a manual activity type."
            : "Upload queued. Activity type will be inferred automatically.",
        );
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
        <Dialog
          open={modalOpen}
          onOpenChange={(open) => {
            setModalOpen(open);
            if (!open) {
              setShowAdvanced(false);
              setActivityType("");
              setEnterpriseInputs({
                reportingPeriod: "",
                supplier: "",
                department: "",
                spendAmount: "",
                invoiceNumber: "",
                category: "",
              });
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Activity Type Detection</DialogTitle>
              <DialogDescription>
                Current file: <strong>{selectedFile.name}</strong>. Leave the
                upload in auto mode and the backend will classify it for you.
              </DialogDescription>
            </DialogHeader>

            <Card className="gap-3 border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 py-4 shadow-none">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                  <Sparkles className="size-4 text-sky-600" />
                  Automatic classification
                  <Badge
                    variant="secondary"
                    className="ml-2 bg-white text-sky-900"
                  >
                    Enterprise mode
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <p>
                  We will infer the activity type from file structure, common
                  enterprise headers, and schema-aware matching.
                </p>
                <p>
                  High-confidence uploads continue automatically. Low-confidence
                  uploads are sent to the review queue so nothing gets silently
                  misclassified.
                </p>
              </CardContent>
            </Card>

            <div className="mt-4 space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                onClick={() => setShowAdvanced((current) => !current)}
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="size-4" />
                  Advanced controls
                </span>
                <ChevronDown
                  className={`size-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                />
              </Button>

              {showAdvanced ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-900">
                      Manual activity type override
                    </span>
                    <select
                      value={activityType}
                      onChange={(e) => setActivityType(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none transition focus:border-sky-400"
                    >
                      <option value="">Auto-detect from file</option>
                      {activityTypes.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-sm text-slate-500">
                      {activityType
                        ? activityTypes.find((a) => a.value === activityType)
                            ?.description
                        : "Leave this blank unless you need to force a specific classification before parsing starts."}
                    </p>
                  </label>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-900">
                        Reporting period
                      </span>
                      <input
                        type="text"
                        value={enterpriseInputs.reportingPeriod}
                        onChange={(e) =>
                          setEnterpriseInputs((prev) => ({
                            ...prev,
                            reportingPeriod: e.target.value,
                          }))
                        }
                        placeholder="e.g. 2026-05"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none transition focus:border-sky-400"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-900">
                        Supplier
                      </span>
                      <input
                        type="text"
                        value={enterpriseInputs.supplier}
                        onChange={(e) =>
                          setEnterpriseInputs((prev) => ({
                            ...prev,
                            supplier: e.target.value,
                          }))
                        }
                        placeholder="Supplier name or UUID"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none transition focus:border-sky-400"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-900">
                        Department
                      </span>
                      <input
                        type="text"
                        value={enterpriseInputs.department}
                        onChange={(e) =>
                          setEnterpriseInputs((prev) => ({
                            ...prev,
                            department: e.target.value,
                          }))
                        }
                        placeholder="Department name or UUID"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none transition focus:border-sky-400"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-900">
                        Spend amount
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={enterpriseInputs.spendAmount}
                        onChange={(e) =>
                          setEnterpriseInputs((prev) => ({
                            ...prev,
                            spendAmount: e.target.value,
                          }))
                        }
                        placeholder="e.g. 1250.50"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none transition focus:border-sky-400"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-900">
                        Invoice / document
                      </span>
                      <input
                        type="text"
                        value={enterpriseInputs.invoiceNumber}
                        onChange={(e) =>
                          setEnterpriseInputs((prev) => ({
                            ...prev,
                            invoiceNumber: e.target.value,
                          }))
                        }
                        placeholder="Invoice number or doc reference"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none transition focus:border-sky-400"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-900">
                        Category
                      </span>
                      <input
                        type="text"
                        value={enterpriseInputs.category}
                        onChange={(e) =>
                          setEnterpriseInputs((prev) => ({
                            ...prev,
                            category: e.target.value,
                          }))
                        }
                        placeholder="e.g. materials_construction"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none transition focus:border-sky-400"
                      />
                    </label>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Optional fields. Leave blank to let the parser infer values
                    from file content and document metadata.
                  </p>
                </div>
              ) : null}
            </div>

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
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">File Management</h1>
                <p className="text-muted-foreground">
                  Manage and view your uploaded files
                  {/* Only admins can select and delete files */}
                </p>
              </div>
              {uploadStatus === "success" && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2 text-green-700">
                  <CheckCircle className="size-5" />
                  <span className="text-sm font-medium">
                    Upload successful!
                  </span>
                </div>
              )}
              {uploadStatus === "error" && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-red-700">
                  <XCircle className="size-5" />
                  <span className="text-sm font-medium">Upload failed</span>
                </div>
              )}
            </div>
          </div>
          {/* Replace "your_table_name" with your actual Supabase table name */}
          <DataTableDemo
            key={refreshTrigger}
            organizationId={organization?.id ?? ""}
            locationId={locationId}
          />
        </div>
      </section>
    </>
  );
}
