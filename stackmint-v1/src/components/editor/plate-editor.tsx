'use client';

import * as React from 'react';

import { normalizeNodeId } from 'platejs';
import { Plate, usePlateEditor } from 'platejs/react';
import { createClient } from '@supabase/supabase-js';
import { useSession } from '@clerk/nextjs';
import { EditorKit } from '@/components/editor/editor-kit';
import { SettingsDialog } from '@/components/editor/settings-dialog';
import { Editor, EditorContainer } from '@/components/ui/editor';
//import { CitationPlugin } from './plugins/citation-plugin';

// --- your debounce hook
export const useDebounce = <T,>(value: T, delay = 600) => {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const handler: NodeJS.Timeout = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// --- util
function stripIds(nodes: any): any {
  if (!nodes) return nodes;

  const nodeArray = Array.isArray(nodes)
    ? nodes
    : (nodes?.children && Array.isArray(nodes.children) ? nodes.children : null);

  if (!nodeArray) return nodes;

  return nodeArray.map((node: any) => {
    const { id, children, ...rest } = node;
    return {
      ...rest,
      ...(children ? { children: stripIds(children) } : {}),
    };
  });
}

export function PlateEditor({ docId, initialValue, }: { docId?: string; initialValue?: any; }) {
  const defaultValue = React.useMemo(
    () => (initialValue ? normalizeNodeId(initialValue) : value),
    [initialValue]
  );

  const { session } = useSession();
  const [pendingValue, setPendingValue] = React.useState<any>(null);
  const debouncedValue = useDebounce(pendingValue, 1000); // 1s delay

  const editor = usePlateEditor({
    plugins: EditorKit,
    value: defaultValue,
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

  // state to hold stripped value from onChange

  // pass it through debounce

  async function saveDoc(id: string, content: any) {
  try {
    const { data, error } = await client
      .from('construction_sites_reports')
      .upsert({
        id,
        report_content: content,
        updated_at: new Date().toISOString(),
    })
      .select(); // returns the row after upsert

    if (error) throw error;

    //console.log('✅ Document saved successfully:', data);
    return data;
  } catch (err) {
    console.error('❌ Error saving document to construction_sites_reports:', err);
    return null;
  }
}

  // effect fires when debouncedValue updates
  React.useEffect(() => {
    if (debouncedValue) {
      console.log("💾 debounced value ready to save:", debouncedValue);
      // <-- call supabase save here
      saveDoc(docId!, debouncedValue);
    }
  }, [debouncedValue]);

  return (
    <Plate
      editor={editor}
      onChange={(newValue) => {
        const stripped = stripIds(newValue.editor.children);
        setPendingValue(stripped); // put into state
      }}
    >
      <EditorContainer>
        <Editor variant="demo" />
      </EditorContainer>

      <SettingsDialog />
    </Plate>
  );
}


const value = normalizeNodeId([
  {
    type: "p", // ✅ add a type for the root block
    children: [
      { text: "Experience a modern rich-text editor built with " },
      { type: "a", url: "https://slatejs.org", children: [{ text: "Slate" }] },
      { text: " and " },
      { type: "a", url: "https://reactjs.org", children: [{ text: "React" }] },
      {
        text: ". This playground showcases just a part of Plate's capabilities.",
      },
    ],
  },
]);
