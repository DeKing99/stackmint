// citation-plugin.tsx
import React from "react";
import { createPlatePlugin } from "platejs/react";
import type { PlateEditor } from "platejs/react";
import { Transforms } from "slate";
import { UploadedFile } from "@/components/file-table";

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



// export const CitationElement: React.FC<CitationElementProps> = ({
//   attributes,
//   children,
//   element,
// }) => {
//   const fileId = element.fileId;
//   const fileName = element.fileName ?? "Citation";

//   const openPreview = (e: React.MouseEvent<HTMLButtonElement>) => {
//     e.preventDefault();
//     window.dispatchEvent(
//       new CustomEvent("sm-open-file-preview", { detail: { fileId } })
//     );
//   };

//   return (
//     <span
//       {...attributes}
//       contentEditable={false}
//       data-file-id={fileId}
//       style={{
//         display: "inline-flex",
//         alignItems: "center",
//         gap: 6,
//         padding: "2px 6px",
//         borderRadius: 6,
//         background: "#f3f4f6",
//         border: "1px solid #e5e7eb",
//         fontSize: 13,
//         userSelect: "none",
//       }}
//     >
//       <button
//         onMouseDown={openPreview}
//         style={{
//           border: "none",
//           background: "transparent",
//           padding: 0,
//           margin: 0,
//           cursor: "pointer",
//           fontSize: 13,
//         }}
//         aria-label={`Preview ${fileName}`}
//         type="button"
//       >
//         📄 {fileName}
//       </button>
//       {children}
//     </span>
//   );
// };
export const CitationElement: React.FC<CitationElementProps> = ({
  attributes,
  children,
  element,
}) => {
  const fileId = element.fileId;
  const fileName = element.fileName ?? "Citation";

  const openPreview = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    window.dispatchEvent(
      new CustomEvent("sm-open-file-preview", { detail: { fileId } })
    );
  };

  console.log("Rendering citation element:", element);

  return (
    <span
      {...attributes}
      contentEditable={false}
      data-file-id={fileId}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px 16px",
        background: "red",
        color: "white",
        borderRadius: "8px",
        border: "2px solid black",
        fontWeight: "bold",
        fontSize: 16,
      }}
    >
      <button
        onMouseDown={openPreview}
        style={{
          border: "none",
          background: "transparent",
          color: "white",
          cursor: "pointer",
          fontSize: 16,
        }}
        aria-label={`Preview ${fileName}`}
        type="button"
      >
        📄 {fileName}
      </button>
      {children}
    </span>
  );
};

/* -------------------------
   The Plugin (with working API)
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

  // 🔥 Add API so useEditorPlugin(CitationPlugin).api.insertCitation() works
  api: {
    insertCitation: ({
      editor,
      files,
    }: {
      editor?: PlateEditor;
      //file: { id: string; file_name?: string; name?: string };
      files: UploadedFile | UploadedFile[];
    }) => {
      if (!files || !editor) return;

      const fileArray = Array.isArray(files) ? files : [files];

      for (const file of fileArray) {
        if (!file?.id) continue;

        const node = {
          type: "citation",
          fileId: file.id,
          fileName: file.file_name ?? file.file_name ?? "file",
          children: [{ text: "" }],
        };

        Transforms.insertNodes(editor as any, node);
      }

      console.log(
        "✅ Citation inserted:",
        fileArray.map((f) => f.file_name)
      );
    },
  },
});
