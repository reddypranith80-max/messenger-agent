import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything is private unless listed here. Webhooks authenticate by signature.
const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)", "/api/webhooks(.*)"]);

export default clerkMiddleware(
  async (auth, request) => {
    if (!isPublicRoute(request)) await auth.protect();
  },
  // A development machine whose clock runs a few seconds behind Clerk's sees
  // fresh session tokens as "not yet valid" and bounces to sign-in. Tolerate
  // more skew locally; production keeps Clerk's default (5 seconds).
  process.env.NODE_ENV === "development" ? { clockSkewInMs: 30_000 } : {},
);

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
