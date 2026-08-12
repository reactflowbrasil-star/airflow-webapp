import { NextResponse, type NextRequest } from "next/server";

import { verifySessionToken } from "@/server/auth/session";

/**
 * Primeira barreira de acesso às áreas autenticadas.
 *
 * IMPORTANTE: isto é conveniência de navegação, não a linha de defesa. A
 * autorização real acontece em cada Route Handler e Server Component via
 * `requireRole`/`assertOwnership` (§5) — o middleware apenas evita que o
 * usuário veja um esqueleto de página antes de ser redirecionado.
 */

const ROTAS_POR_PAPEL: { prefixo: string; papel: "CUSTOMER" | "PROVIDER" | "ADMIN" }[] = [
  { prefixo: "/app", papel: "CUSTOMER" },
  { prefixo: "/pro", papel: "PROVIDER" },
  { prefixo: "/admin", papel: "ADMIN" },
];

const DESTINO_POR_PAPEL: Record<string, string> = {
  CUSTOMER: "/app",
  PROVIDER: "/pro",
  ADMIN: "/admin",
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("airflow_session")?.value;
  const session = token ? await verifySessionToken(token) : null;

  // Já autenticado não precisa ver login/cadastro/recuperação de senha
  if (
    session &&
    (pathname === "/entrar" ||
      pathname === "/cadastrar" ||
      pathname === "/recuperar-senha")
  ) {
    return NextResponse.redirect(
      new URL(DESTINO_POR_PAPEL[session.role] ?? "/", request.url),
    );
  }

  const regra = ROTAS_POR_PAPEL.find(
    (r) => pathname === r.prefixo || pathname.startsWith(`${r.prefixo}/`),
  );
  if (!regra) return NextResponse.next();

  if (!session) {
    const login = new URL("/entrar", request.url);
    login.searchParams.set("redirecionar", pathname);
    return NextResponse.redirect(login);
  }

  if (session.role !== regra.papel) {
    return NextResponse.redirect(
      new URL(DESTINO_POR_PAPEL[session.role] ?? "/", request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/app/:path*",
    "/pro/:path*",
    "/admin/:path*",
    "/entrar",
    "/cadastrar",
    "/recuperar-senha",
  ],
};
