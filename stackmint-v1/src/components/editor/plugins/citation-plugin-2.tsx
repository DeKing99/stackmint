// citation-plugin.tsx
import React from "react";
import { createPlatePlugin } from "platejs/react";
import type { PlateEditor } from "platejs/react";
import { Transforms } from "slate";
import { UploadedFile } from "@/components/file-table";
import { Badge } from "@/components/ui/badge";
import { FileIcon } from "lucide-react";
// const citationPlugin2 = createPlatePlugin({
//     key: 'citation2',
//     node: {
//         isElement: true,
//         type: 'button',
//         component: () => <button>Click me</button>,
//     },
//     handlers: {
//         onChange: ({ editor, value }) => {
//             console.info(editor, value);
//             console.log('Citation plugin 2 change');
//         },
//     }
// })


/* -------------------------
   Citation Element Renderer
   ------------------------- */
interface CitationElementProps {
  attributes: any;
  children: React.ReactNode;
  element: {
    fileId: string;
    fileName?: string;
    [key: string]: any;
  };
}

export const CitationElement: React.FC<CitationElementProps> = ({
  attributes,
  children,
  element,
}) => {
  const fileId = element.fileId;
  const fileName = element.fileName ?? "Citation";

  const openFileInNewTab = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    try {
      // Call your Next.js route that fetches the signed URL
      const url = `/api/files/stream/${fileId}`

      // Open signed file URL in a new tab
      window.open(url, "_blank");
    } catch (err) {
      console.error("Error opening file:", err);
    }
  };

  return (
    <span
      {...attributes}
      contentEditable={false}
      data-file-id={fileId}
      className="inline-flex items-center align-middle"
      style={{ margin: "0 2px" }}
    >
      <button
        onMouseDown={openFileInNewTab}
        type="button"
        className="
          inline-flex items-center gap-1
          bg-neutral-100 hover:bg-neutral-200
          border border-neutral-300
          text-neutral-700
          text-[13px]
          px-2 py-[2px]
          rounded-full
          cursor-pointer
          transition-all
          duration-150
          select-none
          leading-tight
        "
      >
        <FileIcon className="w-3 h-3" />
        <span className="truncate max-w-[100px]">{fileName}</span>
      </button>
      {children}
    </span>
  );
};



/* -------------------------
   The Plugin (cleaned up)
   ------------------------- */

export const CitationPlugin = createPlatePlugin({
  key: "citation",
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    type: "citation",
    component: CitationElement,
  },
}).overrideEditor(({ editor }) => {
  // Add custom API methods
  const insertCitation = ({
    files,
  }: {
    files: UploadedFile | UploadedFile[];
  }) => {
    if (!files) return;

    const fileArray = Array.isArray(files) ? files : [files];

    for (const file of fileArray) {
      if (!file?.id) continue;

      const node = {
        type: "citation",
        fileId: file.id,
        fileName: file.file_name ?? "File",
        children: [{ text: "" }],
      };

      Transforms.insertNodes(editor as any, node);
    }

    console.log("✅ Citation inserted:", fileArray.map((f) => f.file_name));
  };

  // Return editor + new API
  return {
    ...editor,
    api: {
      ...(editor as any).api,
      insertCitation,
    },
  };
});
