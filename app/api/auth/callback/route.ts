import { NextRequest, NextResponse } from "next/server";

// Google OAuth redirect lands here from localhost:3000.
// We just pass the code through to the FastAPI backend which handles the exchange.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?drive=error", req.url));
  }

  // Forward to FastAPI callback handler
  return NextResponse.redirect(`${API}/auth/callback?${new URLSearchParams({ code, state })}`);
}
