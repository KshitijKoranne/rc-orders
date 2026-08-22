import { clearSessionCookieHeader } from "../../../../lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearSessionCookieHeader(request),
      },
    },
  );
}
