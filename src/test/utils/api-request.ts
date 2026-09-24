import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { NextRequest as NextRequestImpl } from "next/server";
import { getJwtSecret } from "@/lib/jwt";

export interface BuildRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

const BASE_URL = "http://localhost:3000";

/**
 * Builds a real `NextRequest` over the wire shape route handlers expect:
 * cookie-based auth via the `keja-token` cookie, `nextUrl.searchParams` for
 * query params, and a JSON body when supplied.
 */
export function buildRequest(path: string, options: BuildRequestOptions = {}): NextRequest {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const headers = new Headers(options.headers);
  if (options.token) {
    headers.set("cookie", `keja-token=${options.token}`);
  }

  const init: ConstructorParameters<typeof NextRequestImpl>[1] = {
    method: options.method ?? "GET",
    headers,
  };
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(options.body);
  }
  return new NextRequestImpl(url, init);
}

/**
 * Signs a JWT with the same secret `authenticate`/`requirePermission` use
 * (`getJwtSecret`), so tokens minted in tests are accepted by the real verify
 * path. The token carries no expiry unless requested.
 */
export function signToken(userId: string, extra: Record<string, unknown> = {}): string {
  return jwt.sign({ userId, ...extra }, getJwtSecret());
}

/** Signs a token whose `exp` is already in the past — `verify` will reject it. */
export function expiredToken(userId: string): string {
  return jwt.sign({ userId }, getJwtSecret(), { expiresIn: -1 });
}

/**
 * Builds the async `context.params` argument async route handlers receive.
 */
export function withParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
