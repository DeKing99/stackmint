"use client";

import React, { useEffect, useState, useMemo } from "react";
//import { createClient } from "@supabase/supabase-js";
import { createClerkSupabaseClient } from "@/lib/supabase-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSession } from "@clerk/nextjs";
import { VisuallyHidden } from "@ariakit/react/visually-hidden";



// interface FileData {
//   id: number;
//   file_name: string;
//   file_url: string;
//   mime_type: string;
//   created_at: string;
// }

interface FileData {    
    id: string;
    file_name: string;
    file_site_id: string;
    mime_type: string;
    file_url: string;
    user_id?: string;
    user_name?: string;
    organization_id?: string;
    created_at?: string;
};

interface FileData2 {
    url: string;
    mime_type: string;
    name: string;
}
export function FilePreviewer() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<FileData2 | null>(null);

  const { session } = useSession();

  const supabase = useMemo(
    () =>
      createClerkSupabaseClient(
        () => session?.getToken?.() ?? Promise.resolve(null)
      ),
    [session]
  );

  useEffect(() => {
    const handler = async (event: Event) => {
      //const customEvent = event as CustomEvent<{ fileId: string }>;       
      const customEvent = event as CustomEvent<FileData2>;
      //const { fileId } = customEvent.detail;
      setFile(customEvent.detail)
      setOpen(true);
    };

    //   // Fetch from your Supabase table
    //   const { data, error } = await supabase
    //     .from("uploaded_esg_files_construction") // your table name
    //     .select("*")
    //     .eq("id", fileId)
    //     .single();
      
    //   console.log("Fetched file data:", data);
    //   console.log(fileId)

    //   if (error) {
    //     console.log(fileId)
    //     console.error("Error fetching file:", error);
    //     return;
    //   }

    //   setFile(data);
    //   setOpen(true);
    // };

    window.addEventListener("sm-open-file-preview", handler);
    return () =>
      window.removeEventListener("sm-open-file-preview", handler);
  }, []);

  if (!file) return null;

  const renderPreview = () => {
    const mime = file.mime_type || "";

    if (mime.startsWith("image/")) {
      return (
        <img
          src={file.url}
          alt={file.name}
          className="rounded-lg max-h-[80vh] object-contain mx-auto"
        />
      );
    } else if (mime.startsWith("text/") || mime.includes("csv")) {
      return (
        <object
          data={file.url}
          type={mime}
          className="w-full h-full min-h-[400px] rounded-lg border"
        >
          <div className="text-center text-muted-foreground p-4">
            No inline preview available.
            <div className="mt-4">
              <Button asChild>
                <a href={file.url} target="_blank" rel="noopener noreferrer">
                  Download file
                </a>
              </Button>
            </div>
          </div>
        </object>
      );
    } else if (mime.startsWith("application/pdf")) {
      return (
        <iframe
          src={file.url}
          className="w-full h-full min-h-[400px] rounded-lg border"
        />
      );
    } else {
      return (
        <div className="text-center text-muted-foreground">
          No preview available for this file type.
          <div className="mt-4">
            <Button asChild>
              <a href={file.url} target="_blank" rel="noopener noreferrer">
                Download file
              </a>
            </Button>
          </div>
        </div>
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{file.name}</DialogTitle>
          <VisuallyHidden>
            <DialogTitle id="file-preview-title">{file.name}</DialogTitle>
          </VisuallyHidden>
          <DialogDescription>
            This is a preview of the added citation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto mt-4 rounded-lg border bg-muted/5">
          {renderPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
