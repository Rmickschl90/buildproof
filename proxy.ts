import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/archived/:path*"],
};