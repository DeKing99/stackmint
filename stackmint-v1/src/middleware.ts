import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default clerkMiddleware(async (auth, req) => {
  const { userId, orgSlug } = await auth();

  // ✅ Only redirect when on /redirect
  if (req.nextUrl.pathname === "/redirect") {
    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    if (!orgSlug) {
      return NextResponse.next(); // Let redirect page render
    }

    return NextResponse.redirect(new URL(`/orgs/${orgSlug}/dashboard`, req.url));
  }

  // ✅ Don't redirect elsewhere unless required
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|_static|.*\\..*).*)"],
};
