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

export async function proxy(request: NextRequest) {
  const pathname = new URL(request.url).pathname;
  if (isPublicPath(pathname)) return NextResponse.next();

  const session = await refreshSessionFromRequest(request);
  if (!session) {
    if (pathname.startsWith("/api/")) return unauthorizedResponse(request);
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("Set-Cookie", sessionCookieHeader(session, request));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/|assets/|_vinext/|favicon.ico|robots.txt).*)"],
};
