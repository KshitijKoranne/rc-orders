import { NextResponse, type NextRequest } from "next/server";
import {
  refreshSessionFromRequest,
  sessionCookieHeader,
  unauthorizedResponse,
} from "./lib/auth";

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/api/auth" ||
    pathname.startsWith("/api/auth/")
  );
}

// No CSP on purpose: the RSC/vinext inline bootstrap scripts and inline styles would need
// 'unsafe-inline', which makes a CSP mostly decorative. frame-ancestors is the useful part.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000",
};

function withSecurityHeaders(response: NextResponse) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = new URL(request.url).pathname;
  if (isPublicPath(pathname)) return withSecurityHeaders(NextResponse.next());

  const session = await refreshSessionFromRequest(request);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      const denied = unauthorizedResponse(request);
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) denied.headers.set(name, value);
      return denied;
    }
    return withSecurityHeaders(NextResponse.redirect(new URL("/login", request.url)));
  }

  const response = NextResponse.next();
  response.headers.set("Set-Cookie", sessionCookieHeader(session, request));
  response.headers.set("Cache-Control", "private, no-store");
  return withSecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/|assets/|_vinext/|favicon.ico|robots.txt).*)"],
};
