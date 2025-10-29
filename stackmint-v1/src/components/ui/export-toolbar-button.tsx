"use client";

import * as React from "react";
import type { DropdownMenuProps } from "@radix-ui/react-dropdown-menu";
import { MarkdownPlugin } from "@platejs/markdown";
import { ArrowDownToLineIcon } from "lucide-react";
import { createSlateEditor, serializeHtml } from "platejs";
import { useEditorRef } from "platejs/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BaseEditorKit } from "@/components/editor/editor-base-kit";
import { EditorStatic } from "./editor-static";
import { ToolbarButton } from "./toolbar";

import JSZip from "jszip";
import { saveAs } from "file-saver";
import { constant } from "lodash";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const siteUrl = "https://platejs.org";

export function ExportToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  // Collect citation nodes that have fileId + fileName
  const getCitationFiles = (nodes: any) => {
    const files: { fileId: string; fileName: string }[] = [];
    const recurse = (n: any) => {
      if (Array.isArray(n)) n.forEach(recurse);
      else if (n && typeof n === "object") {
        if (
          n.type === "citation" &&
          (n.fileId || n.fileID) && // tolerate different casing
          (n.fileName || n.file_name || n.file)
        ) {
          files.push({
            fileId: n.fileId ?? n.fileID,
            fileName: n.fileName ?? n.file_name ?? n.file,
          });
        }
        if (n.children) recurse(n.children);
      }
    };
    recurse(nodes);
    return files;
  };

  // Helper: try to download a citation by fileId.
  // Strategy:
  // 1) if fileId looks like a URL -> fetch(fileId)
  // 2) else -> fetch a generic endpoint /api/files/{fileId} (adapt to your backend)
  // If you use Supabase, replace this with supabase.storage.from('bucket').download(path)
  const fetchCitationBlob = async (fileId: string): Promise<Blob | null> => {
    try {
      // 2) try a generic API route on your backend
      const apiRes = await fetch(`/api/files/${encodeURIComponent(fileId)}`);
      if (apiRes.ok) return await apiRes.blob();
      console.log(apiRes);
      console.warn("API fetch failed for citation fileId:", fileId, apiRes);
      console.warn("Unable to fetch citation file for id:", fileId);
      return null;
    } catch (err) {
      console.error("fetchCitationBlob error for", fileId, err);
      return null;
    }
  };

  // Export as paginated text-based PDF (html2pdf handles pagination)
  // const exportToPdf = async () => {
  //   const { default: html2pdf } = await import("html2pdf.js");

  //   const editorStatic = createSlateEditor({
  //     plugins: BaseEditorKit,
  //     value: editor.children,
  //   });

  //   const editorHtml = await serializeHtml(editorStatic, {
  //     editorComponent: EditorStatic,
  //   });

  //   const wrapper = document.createElement("div");
  //   wrapper.innerHTML = `
  //   <style>
  //     /* Override Tailwind colors that use lab()/lch() */
  //     * {
  //       color: #000 !important;
  //       background-color: #fff !important;
  //     }
  //     body {
  //       font-family: 'Inter', sans-serif;
  //     }
  //     .page-break { page-break-after: always; }
  //   </style>
  //   ${editorHtml}
  // `;

  // wrapper.innerHTML = wrapper.innerHTML.replace(/(lab|lch)\([^)]+\)/g, "#000");

  //   // const opt = {
  //   //   margin: 10,
  //   //   filename: "SECR_Report.pdf",
  //   //   image: { type: "jpeg", quality: 0.98 },
  //   //   html2canvas: { scale: 2 },
  //   //   jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  //   // };
  //   const opt = {
  //     margin: 10,
  //     image: { type: "jpeg" as const, quality: 0.98 },
  //     html2canvas: { scale: 2 },
  //     jsPDF: {
  //       unit: "mm" as const,
  //       format: "a4" as const,
  //       orientation: "portrait" as const,
  //     },
  //   };

  //   await html2pdf().set(opt).from(wrapper).save();
  // };


  const exportToPdf = async () => {
    const { default: html2pdf } = await import("html2pdf.js");

    // 1. Create static editor instance
    const editorStatic = createSlateEditor({
      plugins: BaseEditorKit,
      value: editor.children,
    });

    // 2. Serialize to HTML
    let editorHtml = await serializeHtml(editorStatic, {
      editorComponent: EditorStatic,
    });

    // Remove all lab()/lch() colors directly from the markup (extra safety)
    editorHtml = editorHtml.replace(/(lab|lch)\([^)]+\)/g, "#000");

    // 3. Create an isolated shadow root (this stops html2canvas from seeing global Tailwind styles)
    const sandboxHost = document.createElement("div");
    const shadow = sandboxHost.attachShadow({ mode: "open" });

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
    <style>
      :host, html, body {
        background: #fff !important;
        color: #000 !important;
        font-family: 'Inter', sans-serif;
      }
      * {
        color: #000 !important;
        background: #fff !important;
        border-color: #000 !important;
        box-shadow: none !important;
      }
      img { max-width: 100%; height: auto; }
      .page-break { page-break-after: always; }
    </style>
    ${editorHtml}
  `;
    
    //this might break things in the future so little note here to let me know if thats the case
    wrapper.style.paddingBottom = "20px";

    shadow.appendChild(wrapper);
    document.body.appendChild(sandboxHost);

    // Wait for rendering
    await new Promise((res) => setTimeout(res, 200));

    const opt = {
      margin: 10,
      filename: "SECR_Report.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        // skip cloning global CSS
        ignoreElements: (el: HTMLElement) =>
          el.tagName === "STYLE" || el.tagName === "LINK",
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    try {
      // 4. Render PDF directly from the shadow DOM
      await html2pdf().set(opt).from(wrapper).save();
    } finally {
      sandboxHost.remove();
    }
  };


  // Export: PDF + citations bundled into a ZIP
  // const exportReportWithFiles = async () => {
  //   const { default: html2pdf } = await import("html2pdf.js");
  //   const zip = new JSZip();

  //   // Build the report HTML and wrapper
  //   const editorStatic = createSlateEditor({
  //     plugins: BaseEditorKit,
  //     value: editor.children,
  //   });

  //   console.log(
  //     "editorStatic just to see what it returns becuase maybe i have to use plate editor instead:",
  //     editorStatic
  //   );

  //   const editorHtml = await serializeHtml(editorStatic, {
  //     editorComponent: EditorStatic,
  //   });

  //   const wrapper = document.createElement("div");
  //   wrapper.innerHTML = `
  //   <style>
  //     /* Override Tailwind colors that use lab()/lch() */
  //     * {
  //       color: #000 !important;
  //       background-color: #fff !important;
  //     }
  //     body {
  //       font-family: 'Inter', sans-serif;
  //     }
  //     .page-break { page-break-after: always; }
  //   </style>
  //   ${editorHtml}
  // `;

  //   wrapper.innerHTML = wrapper.innerHTML.replace(
  //     /(lab|lch)\([^)]+\)/g,
  //     "#000"
  //   );

  //   // * {
  //   //       color-scheme: light dark;
  //   //       color: black !important;
  //   //       background-color: white !important;
  //   //     }

  //   // Generate the PDF blob
  //   const opt = {
  //     margin: 10,
  //     image: { type: "jpeg" as const, quality: 0.98 },
  //     html2canvas: { scale: 2 },
  //     jsPDF: {
  //       unit: "mm" as const,
  //       format: "a4" as const,
  //       orientation: "portrait" as const,
  //     },
  //   };

  //   const pdfBlob: Blob = await html2pdf()
  //     .set(opt)
  //     .from(wrapper)
  //     .output("blob");
  //   zip.file("SECR_Report.pdf", pdfBlob);

  //   // Find citation files in the editor and add them to the zip
  //   const citations = getCitationFiles(editor.children);
  //   if (citations.length > 0) {
  //     const folder = zip.folder("Citations")!;
  //     for (const c of citations) {
  //       try {
  //         const blob = await fetchCitationBlob(c.fileId);
  //         if (blob) {
  //           // ensure filename fallback
  //           const name = c.fileName || `file-${c.fileId}`;
  //           folder.file(name, blob);
  //         } else {
  //           console.warn("Skipping citation (not found):", c);
  //         }
  //       } catch (err) {
  //         console.error("Error adding citation to ZIP", c, err);
  //       }
  //     }
  //   }

  //   // Generate and download zip
  //   const zipBlob = await zip.generateAsync({ type: "blob" });
  //   saveAs(zipBlob, "SECR_Report_Package.zip");
  // };

  // async function exportReportBundle(editor, citationFiles) {
  //   try {
  //     // Step 1: Generate PDF
  //     const element = document.getElementById("report-container");
  //     const canvas = await html2canvas(element, {
  //       scale: 2,
  //       useCORS: true,
  //       logging: false,
  //     });
  //     const imgData = canvas.toDataURL("image/png");
  //     const pdf = new jsPDF("p", "mm", "a4");

  //     const pageWidth = pdf.internal.pageSize.getWidth();
  //     const pageHeight = pdf.internal.pageSize.getHeight();
  //     const imgHeight = (canvas.height * pageWidth) / canvas.width;
  //     let heightLeft = imgHeight;
  //     let position = 0;

  //     pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
  //     heightLeft -= pageHeight;

  //     while (heightLeft > 0) {
  //       position = heightLeft - imgHeight;
  //       pdf.addPage();
  //       pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
  //       heightLeft -= pageHeight;
  //     }

  //     const pdfBlob = pdf.output("blob");

  //     // Step 2: Prepare ZIP
  //     const zip = new JSZip();
  //     zip.file("report.pdf", pdfBlob);

  //     for (const file of citationFiles) {
  //       const response = await fetch(file.publicUrl);
  //       const blob = await response.blob();
  //       zip.file(file.fileName, blob);
  //     }

  //     // Step 3: Generate and Save ZIP
  //     const zipBlob = await zip.generateAsync({ type: "blob" });
  //     saveAs(zipBlob, "report_bundle.zip");
  //   } catch (err) {
  //     console.error("Error generating report bundle:", err);
  //   }
  // }

  const exportReportWithFiles = async () => {
    const { default: html2pdf } = await import("html2pdf.js");
    const zip = new JSZip();

    // 1. Create static editor instance
    const editorStatic = createSlateEditor({
      plugins: BaseEditorKit,
      value: editor.children,
    });

    const editorHtml = await serializeHtml(editorStatic, {
      editorComponent: EditorStatic,
    });

    // Remove lab/lch colors just in case
    const sanitizedHtml = editorHtml.replace(/(lab|lch)\([^)]+\)/g, "#000");

    // 2. Shadow DOM isolation (prevents global Tailwind styles from leaking)
    const sandboxHost = document.createElement("div");
    const shadow = sandboxHost.attachShadow({ mode: "open" });

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
    <style>
      :host, html, body {
        background: #fff !important;
        color: #000 !important;
        font-family: 'Inter', sans-serif;
      }
      * {
        color: #000 !important;
        background: #fff !important;
        border-color: #000 !important;
        box-shadow: none !important;
        word-break: break-word; /* Prevent horizontal overflow */
      }
      img { max-width: 100%; height: auto; }
      .page-break { page-break-after: always; }
    </style>
    ${sanitizedHtml}
  `;

    shadow.appendChild(wrapper);
    document.body.appendChild(sandboxHost);

    await new Promise((res) => setTimeout(res, 200)); // wait for rendering

    // 3. Generate PDF blob from isolated DOM
    const opt = {
      margin: 10,
      image: { type: "jpeg" as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        ignoreElements: (el: HTMLElement) =>
          el.tagName === "STYLE" || el.tagName === "LINK",
      },
      jsPDF: {
        unit: "mm" as const,
        format: "a4" as const,
        orientation: "portrait" as const,
      },
    };

    try {
      const pdfBlob: Blob = await html2pdf()
        .set(opt)
        .from(wrapper)
        .output("blob");

      zip.file("SECR_Report.pdf", pdfBlob);

      // 4. Add citation files to the ZIP
      const citations = getCitationFiles(editor.children);
      if (citations.length > 0) {
        const folder = zip.folder("Citations")!;
        for (const c of citations) {
          try {
            const blob = await fetchCitationBlob(c.fileId);
            if (blob) {
              const name = c.fileName || `file-${c.fileId}`;
              folder.file(name, blob);
            } else {
              console.warn("Skipping citation (not found):", c);
            }
          } catch (err) {
            console.error("Error adding citation to ZIP", c, err);
          }
        }
      }

      // 5. Generate and download the ZIP
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, "SECR_Report_Package.zip");
    } finally {
      sandboxHost.remove();
    }
  };



  // Export HTML (standalone) - saved as .html file
  const exportToHtml = async () => {
    const editorStatic = createSlateEditor({
      plugins: BaseEditorKit,
      value: editor.children,
    });

    const editorHtml = await serializeHtml(editorStatic, {
      editorComponent: EditorStatic,
      props: { style: { padding: "0 calc(50% - 350px)" } },
    });

    const tailwindCss = `<link rel="stylesheet" href="${siteUrl}/tailwind.css">`;
    const katexCss = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.18/dist/katex.css" crossorigin="anonymous">`;

    const html = `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          ${tailwindCss}
          ${katexCss}
          <style>
            :root {
              --font-sans: 'Inter', 'Inter Fallback';
              --font-mono: 'JetBrains Mono', 'JetBrains Mono Fallback';
            }
          </style>
        </head>
        <body>${editorHtml}</body>
      </html>`;

    const blob = new Blob([html], { type: "text/html" });
    saveAs(blob, "SECR_Report.html");
  };

  // Export Markdown
  const exportToMarkdown = async () => {
    const md = editor.getApi(MarkdownPlugin).markdown.serialize();
    const blob = new Blob([md], { type: "text/markdown" });
    saveAs(blob, "SECR_Report.md");
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip="Export" isDropdown>
          <ArrowDownToLineIcon className="size-4" />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={exportToHtml}>
            Export as HTML
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportToPdf}>
            Export as PDF
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportToMarkdown}>
            Export as Markdown
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportReportWithFiles}>
            Export Report + Citations (ZIP)
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
