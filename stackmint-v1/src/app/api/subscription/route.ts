import { auth, clerkClient } from "@clerk/nextjs/server";

export async function GET() {
  const { orgId } = auth();

  if (!orgId) {
    return Response.json({
      active: false,
      subscription: null
    });
  }

  try {
    const subscription =
      await clerkClient.billing.getOrganizationBillingSubscription(orgId);

    const active =
      subscription?.status === "active" ||
      subscription?.status === "trialing";

    return Response.json({
      active,
      subscription
    });

  } catch (error) {

    return Response.json({
      active: false,
      subscription: null
    });
  }
}