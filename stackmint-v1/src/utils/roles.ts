import { auth } from "@clerk/nextjs/server";

export type AppRole = "owner" | "manager" | "member" | "admin";

function isAppRole(value: unknown): value is AppRole {
  return value === "owner" || value === "manager" || value === "member" || value === "admin";
}

export function normalizeAppRole(params: {
  metadataRole?: unknown;
  orgRole?: string | null;
}): AppRole {
  const { metadataRole, orgRole } = params;

  if (orgRole === "org:owner" || orgRole === "org:admin") {
    return "admin";
  }

  if (orgRole === "org:member") {
    return "member";
  }

  if (isAppRole(metadataRole)) {
    return metadataRole;
  }

  return "member";
}

export function hasOrgAdminPower(role: AppRole): boolean {
  return role === "admin" || role === "owner";
}

export async function checkRole(role: AppRole): Promise<boolean> {
  const { sessionClaims, orgRole } = await auth();

  const metadataRole = (sessionClaims?.user_public_metadata as Record<string, unknown> | undefined)?.role;
  const resolvedRole = normalizeAppRole({ metadataRole, orgRole });

  return resolvedRole === role;
}

export async function checkOrgAdminPower(): Promise<boolean> {
  const { orgRole } = await auth();
  const role = normalizeAppRole({ orgRole });
  return hasOrgAdminPower(role);
}
