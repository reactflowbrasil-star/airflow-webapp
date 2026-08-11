import { NextResponse } from "next/server";

import { apiError, parseJsonBody, withApiHandler } from "@/lib/api";
import { registerSchema } from "@/lib/validation/auth";
import { clientKey, rateLimit } from "@/server/auth/rate-limit";
import { setSessionCookie } from "@/server/auth/session";
import { registerUser } from "@/server/services/auth-service";

export const POST = withApiHandler<Request>(async ({ correlationId }, request) => {
  const limit = rateLimit(clientKey(request, "register"), 5, 600);
  if (!limit.allowed) {
    return apiError(429, "RATE_LIMITED", "Muitas tentativas. Aguarde alguns minutos.");
  }

  const input = await parseJsonBody(request, registerSchema);
  const session = await registerUser(input, correlationId);
  await setSessionCookie(session);

  return NextResponse.json(
    { user: { id: session.userId, email: session.email, role: session.role } },
    { status: 201 },
  );
});
