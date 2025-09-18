"use client";
import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { Block, BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSession, useOrganization } from "@clerk/nextjs";

// ---------------- Simple debounce ----------------
function debounce<F extends (...args: any[]) => void>(fn: F, delay: number) {
  let timer: NodeJS.Timeout;
  return (...args: Parameters<F>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export default function Editor({ reportSlug }: { reportSlug: string }) {
  const { session } = useSession();
  const { organization } = useOrganization();

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

  const [initialContent, setInitialContent] = useState<PartialBlock[] | "loading">("loading");

  // ---------------- Save to Supabase ----------------
  const saveToSupabase = useCallback(
    async (jsonBlocks: Block[]) => {
      if (!session) return;

      const { error } = await supabase.from("construction_sites_reports").upsert({
        organization_id: organization?.id ?? null,
        report_slug: reportSlug,
        report_content: jsonBlocks,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error("Error saving:", error.message);
      }
    },
    [session, organization, supabase, reportSlug]
  );

  const debouncedSave = useMemo(
    () => debounce(saveToSupabase, 3000), // ⏳ 3s debounce
    [saveToSupabase]
  );

  // ---------------- Load initial content ----------------
  useEffect(() => {
  if (!session) return;

  let cancelled = false;

  async function loadFromSupabase() {
    try {
      const { data, error } = await supabase
        .from("construction_sites_reports")
        .select("report_content")
        .eq("organization_id", organization?.id ?? null)
        .eq("report_slug", reportSlug)
        .single(); // ✅ enforce exactly 1 row

      if (cancelled) return;

      if (error) {
        console.error("Error loading report:", error.message);
        setInitialContent([]); // ✅ fallback → empty doc
        return;
      }

      if (!data?.report_content) {
        setInitialContent([]); // ✅ start fresh if no content
      } else {
        setInitialContent(data.report_content);
      }
    } catch (err) {
      if (!cancelled) {
        console.error("Unexpected error loading report:", err);
        setInitialContent([]); // ✅ safe fallback
      }
    }
  }

  loadFromSupabase();

  return () => {
    cancelled = true; // ✅ prevents setState after unmount
  };
}, [session, organization?.id, reportSlug, supabase]);



  // ---------------- Setup Editor ----------------
  const editor = useMemo(() => {
    if (initialContent === "loading") return undefined;

    return BlockNoteEditor.create({
      initialContent: initialContent.length > 0 ? initialContent : undefined,
    });
  }, [initialContent]);

  if (!editor) return "Loading content...";

  return (
    <BlockNoteView
      editor={editor}
      theme="light"
      onChange={() => {
        debouncedSave(editor.document);
      }}
    />
  );
}
