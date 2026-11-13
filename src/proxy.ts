import { NextResponse, type NextRequest } from "next/server";
import { authEnabled, isAuthenticated } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (await isAuthenticated(request.cookies)) return NextResponse.next();

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse("يجب تسجيل الدخول", { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|ohda-icon.svg|official-logo-full.webp|custody-official-logo.jpg).*)",
  ],
};
