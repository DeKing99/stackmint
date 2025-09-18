//import { Editor } from "@/components/DynamicEditor";
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor'


export default async function App({ params }: { params: { slug: string; reportSlug: string } }) {
  const { reportSlug } = await params;
  return (
    <div>
      {/* <Editor reportSlug={reportSlug} /> */}
      <SimpleEditor/>
    </div>
  );
}