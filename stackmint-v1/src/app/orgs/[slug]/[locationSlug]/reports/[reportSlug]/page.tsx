// app/orgs/[org]/headquarters/reports/[report]/page.tsx
import { Toaster } from "sonner";
import { auth } from "@clerk/nextjs/server";
import { PlateEditor } from "@/components/editor/plate-editor";

// import dynamic from "next/dynamic";

// const PlateEditor = dynamic(() => import("@/components/editor/plate-editor").then(mod => mod.PlateEditor), {
//   ssr: false,
// });

interface PageProps {
  params: {
    org: string;
    report: string; // this is your [report] slug/id from the URL
  };
}

export default async function Page({ params }: PageProps) {
  const { isAuthenticated, redirectToSignIn, userId, orgId } = await auth();
  console.log({ isAuthenticated, userId, orgId });
  
  if (!isAuthenticated) return redirectToSignIn();

  if (!orgId) {
    // user is signed in but not in an org
    return <p>You are not authorized to view this page.</p>;
  }

  return (
    <div className="h-screen w-full">
      {/* <PlateEditor docId={params.report} />  */}
      <PlateEditor /> 
      <Toaster /> 
    </div>
  );
}
