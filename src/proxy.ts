import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/alerts"];
const SESSION_COOKIE = "ds_session";

/**
 * Next.js 16 network boundary (proxy convention, formerly middleware).
 *
 * Route protection for the authenticated surfaces. Presence of a session cookie is checked
 * here; the signature and expiry are validated against Postgres in the route handler. This
 * keeps middleware free of database calls while still blocking unauthenticated navigation.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!needsAuth) return NextResponse.next();

  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  const supabaseCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"));

  if (sessionCookie || supabaseCookie) return NextResponse.next();

  const loginUrl = new URL("/login", request.nextUrl.origin);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  loginUrl.searchParams.set("error", "session_required");
  return NextResponse.redirect(loginUrl, 303);
}

export const config = {
  matcher: ["/dashboard/:path*", "/alerts/:path*"],
};
