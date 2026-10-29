import { auth, clerkClient } from "@clerk/nextjs/server";

export async function GET() {
  const { orgId } = await auth();

  if (!orgId) {
    return Response.json({
      active: false,
      subscription: null
    });
  }

  try {
    const client = await clerkClient();
    const subscription =
      await client.billing.getOrganizationBillingSubscription(orgId);

    const active = subscription?.status === "active";

    return Response.json({
      active,
      subscription
    });

  } catch {

    return Response.json({
      active: false,
      subscription: null
    });
  }
}