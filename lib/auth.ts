export const SESSION_COOKIE_NAME = "rithya_session";
export const IDLE_SESSION_MS = 5 * 60 * 1000;
export const ACCESS_PASSWORD_ENV = "RITHYA_ACCESS_PASSWORD";

const CLOCK_SKEW_MS = 30_000;

type ParsedSession = {
  issuedAt: number;
  lastActivityAt: number;
  nonce: string;
  payload: string;
  signature: Uint8Array;
};

function configuredPassword() {
  const password = typeof process !== "undefined"
    ? process.env[ACCESS_PASSWORD_ENV]
    : undefined;
  return typeof password === "string" && password.length > 0 ? password : null;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function hmacKey(secret: string) {
  return globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(payload: string, secret: string) {
  const key = await hmacKey(secret);
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return encodeBase64Url(new Uint8Array(signature));
}

function parseSession(value: string): ParsedSession | null {
  try {
    const separator = value.lastIndexOf(".");
    if (separator <= 0) return null;
    const payload = value.slice(0, separator);
    const signature = decodeBase64Url(value.slice(separator + 1));
    const [issuedAtValue, lastActivityAtValue, nonce] = payload.split(".");
    const issuedAt = Number(issuedAtValue);
    const lastActivityAt = Number(lastActivityAtValue);
    if (!nonce || !Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(lastActivityAt)) {
      return null;
    }
    return { issuedAt, lastActivityAt, nonce, payload, signature };
  } catch {
    return null;
  }
}

export function isWithinIdleWindow(lastActivityAt: number, now = Date.now()) {
  return (
    Number.isSafeInteger(lastActivityAt) &&
    lastActivityAt <= now + CLOCK_SKEW_MS &&
    now - lastActivityAt <= IDLE_SESSION_MS
  );
}

async function verifiedSession(value: string, now: number) {
  const secret = configuredPassword();
  const parsed = parseSession(value);
  if (
    !secret ||
    !parsed ||
    parsed.lastActivityAt < parsed.issuedAt ||
    !isWithinIdleWindow(parsed.lastActivityAt, now)
  ) {
    return null;
  }

  const key = await hmacKey(secret);
  const valid = await globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    parsed.signature,
    new TextEncoder().encode(parsed.payload),
  );
  return valid ? { ...parsed, secret } : null;
}

export function isPasswordConfigured() {
  return configuredPassword() !== null;
}

export async function passwordMatches(candidate: unknown) {
  const secret = configuredPassword();
  if (!secret || typeof candidate !== "string" || candidate.length > 512) return false;

  const [candidateDigest, configuredDigest] = await Promise.all([
    globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(candidate)),
    globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
  ]);
  const candidateBytes = new Uint8Array(candidateDigest);
  const configuredBytes = new Uint8Array(configuredDigest);
  let difference = candidateBytes.length ^ configuredBytes.length;
  for (let index = 0; index < Math.max(candidateBytes.length, configuredBytes.length); index += 1) {
    difference |= (candidateBytes[index] ?? 0) ^ (configuredBytes[index] ?? 0);
  }
  return difference === 0;
}

export async function createSessionValue(now = Date.now()) {
  const secret = configuredPassword();
  if (!secret) return null;
  const payload = `${now}.${now}.${globalThis.crypto.randomUUID()}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function refreshSessionValue(value: string | null, now = Date.now()) {
  if (!value) return null;
  const session = await verifiedSession(value, now);
  if (!session) return null;
  const payload = `${session.issuedAt}.${now}.${session.nonce}`;
  return `${payload}.${await sign(payload, session.secret)}`;
}

export async function refreshSessionFromRequest(request: Request, now = Date.now()) {
  return refreshSessionValue(readCookie(request, SESSION_COOKIE_NAME), now);
}

export function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim() || null;
  }
  return null;
}

export function sessionCookieHeader(value: string, request?: Request) {
  const secure = request ? new URL(request.url).protocol === "https:" : true;
  return [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${IDLE_SESSION_MS / 1000}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function clearSessionCookieHeader(request?: Request) {
  const secure = request ? new URL(request.url).protocol === "https:" : true;
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function unauthorizedResponse(request?: Request) {
  return Response.json(
    { error: "Authentication required" },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearSessionCookieHeader(request),
      },
    },
  );
}

export function withSessionCookie(response: Response, value: string, request?: Request) {
  response.headers.set("Set-Cookie", sessionCookieHeader(value, request));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
