import {
  clearSessionCookieHeader,
  createSessionValue,
  isPasswordConfigured,
  passwordMatches,
  sessionCookieHeader,
} from "../../../../lib/auth";
import {
  clearLoginFailures,
  clientKey,
  loginBlockedSeconds,
  recordLoginFailure,
} from "../../../../lib/login-throttle";

export const runtime = "nodejs";

function response(
  body: Record<string, string>,
  status: number,
  request: Request,
  extraHeaders: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      ...extraHeaders,
      "Cache-Control": "no-store",
      "Set-Cookie": clearSessionCookieHeader(request),
    },
  });
}

export async function POST(request: Request) {
  if (!isPasswordConfigured()) {
    return response({ error: "Access password is not configured" }, 503, request);
  }

  const client = clientKey(request.headers);
  const retryAfter = loginBlockedSeconds(client);
  if (retryAfter > 0) {
    return response({ error: "Too many attempts" }, 429, request, {
      "Retry-After": String(retryAfter),
    });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4_096) return response({ error: "Invalid sign-in request" }, 400, request);

  let password: unknown;
  try {
    const payload: unknown = await request.json();
    password = typeof payload === "object" && payload !== null && "password" in payload
      ? (payload as { password?: unknown }).password
      : undefined;
  } catch {
    return response({ error: "Invalid sign-in request" }, 400, request);
  }

  if (!(await passwordMatches(password))) {
    recordLoginFailure(client);
    return response({ error: "Password not accepted" }, 401, request);
  }

  clearLoginFailures(client);
  const session = await createSessionValue();
  if (!session) return response({ error: "Access password is not configured" }, 503, request);

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
