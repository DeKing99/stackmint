// app/redirect/page.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { OrganizationList } from "@clerk/nextjs";

export default async function RedirectPage() {
  const { userId, orgSlug } = await auth();
  if (!userId) return redirect("/sign-in");

  if (!orgSlug) {
    return (
      <OrganizationList
        hideSlug={false}
        hidePersonal
        afterSelectOrganizationUrl="/orgs/:slug/headquarters/dashboard"
        afterCreateOrganizationUrl="/orgs/:slug/headquarters/dashboard"
      />
    );
  }

  //return redirect(`/orgs/${orgSlug}/dashboard`);
}
