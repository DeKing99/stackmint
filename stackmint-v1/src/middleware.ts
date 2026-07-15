export { default } from "./proxy";

// Next statically reads middleware config from this file. Re-exporting the
// config from another module can fall back to the default `/:path*` matcher,
// which makes Clerk intercept `/_next` assets and breaks CSS/JS loading.
export const config = {
  matcher: ["/((?!_next|_static|.*\\..*).*)"],
};
