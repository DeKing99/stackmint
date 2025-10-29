// components/citation-toolbar-button.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useEditorPlugin } from "platejs/react";
//import { CitationPlugin } from "../editor/plugins/citation-plugin";
import { CitationPlugin } from "../editor/plugins/citation-plugin-2";
import { ToolbarButton } from "@/components/ui/toolbar";
import { FileTextIcon } from "lucide-react";
import { useSession, useOrganization } from "@clerk/nextjs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DataTableDemo, UploadedFile } from "@/components/file-table";
import { createClerkSupabaseClient } from "@/lib/supabase-client";

export function CitationToolbarButton({
  locationSlug,
}: {
  locationSlug: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [loadingSite, setLoadingSite] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);
  const { session } = useSession();
  const { organization } = useOrganization();

  // plugin api
  const { api } = useEditorPlugin(CitationPlugin);

  // memoized supabase client
  const supabase = useMemo(
    () =>
      createClerkSupabaseClient(
        () => session?.getToken?.() ?? Promise.resolve(null)
      ),
    [session]
  );

  useEffect(() => {
    // when modal opens, fetch site id for the given slug (single call)
    if (!modalOpen) return;
    if (!organization || !locationSlug) {
      setSiteId(null);
      return;
    }

    let mounted = true;
    setLoadingSite(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("construction_sites")
          .select("id")
          .eq("organization_id", organization.id)
          .eq("site_slug", locationSlug)
          .limit(1)
          .single();

        if (!mounted) return;
        if (error) {
          console.error("Error fetching site:", error);
          setSiteId(null);
        } else {
          setSiteId(data?.id ?? null);
        }
      } catch (e) {
        console.error("Site fetch failed:", e);
        setSiteId(null);
      } finally {
        if (mounted) setLoadingSite(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [modalOpen, organization, locationSlug, supabase]);

  // const handleSelectionChange = (rows: UploadedFile[]) => {
  //   setSelectedFiles(rows);
  // };
  const handleSelectionChange = React.useCallback((rows: UploadedFile[]) => {
    setSelectedFiles(rows);
  }, []);

  const handleAddCitation = async () => {
    if (!api) {
      console.error("Citation API not found");
      return;
    }
    if (!selectedFiles || selectedFiles.length === 0) {
      // could show toast to user
      console.warn("No files selected");
      return;
    }

    try {
      // plugin API may not be fully typed here; cast to any and call if available
      const anyApi = api as any;
      if (typeof anyApi.insertCitation === "function") {
        // plugin API expects a single UploadedFile, pass the selected files
        anyApi.insertCitation({ files: selectedFiles });
        console.log("Inserted citation for files:", selectedFiles);
        // close modal and reset selection
        setModalOpen(false);
        setSelectedFiles([]);
      } else {
        console.error("insertCitation not available on citation API", api);
      }
    } catch (e) {
      console.error("Failed to insert citation:", e);
    }
  };

  return (
    <>
      <div style={{ position: "relative", display: "inline-block" }}>
        <ToolbarButton
          tooltip="Add citation"
          onClick={() => setModalOpen(true)}
        >
          <FileTextIcon />
        </ToolbarButton>
      </div>

      <Dialog
        open={modalOpen}
        onOpenChange={(v) => {
          if (!v) setSelectedFiles([]);
          setModalOpen(v);
        }}
      >
        <DialogContent className="max-w-5xl w-[90vw] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Citation</DialogTitle>
            <DialogDescription>
              {loadingSite
                ? "Loading files..."
                : `Organization: ${organization?.id ?? "unknown"}`}
            </DialogDescription>
          </DialogHeader>

          {/* Table Section */}
          <div className="flex-1 overflow-auto mt-2 rounded-md border bg-background p-2">
            {siteId ? (
              <DataTableDemo
                organizationId={organization?.id!}
                siteId={siteId}
                onSelectionChange={handleSelectionChange}
              />
            ) : loadingSite ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading...
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                No site found for slug: <strong>{locationSlug}</strong>
              </div>
            )}
          </div>

          {/* Selected Files */}
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium">Selected</h4>
            {selectedFiles.length ? (
              <ul className="list-disc list-inside space-y-1">
                {selectedFiles.map((f) => (
                  <li key={f.id} className="truncate text-sm">
                    {f.file_name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No files selected</p>
            )}
          </div>

          {/* Footer button */}
          <div className="pt-4">
            <Button
              onClick={handleAddCitation}
              className="w-full"
              disabled={selectedFiles.length === 0}
            >
              Add Citation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
