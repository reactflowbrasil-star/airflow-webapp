import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api";
import { clearSessionCookie } from "@/server/auth/session";

export const POST = withApiHandler(async () => {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
});
