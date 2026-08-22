import {
  refreshSessionFromRequest,
  sessionCookieHeader,
  unauthorizedResponse,
} from "../../../../lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await refreshSessionFromRequest(request);
  if (!session) return unauthorizedResponse(request);

  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookieHeader(session, request),
      },
    },
  );
}
