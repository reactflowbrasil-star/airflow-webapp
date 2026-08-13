import type { Metadata } from "next";

import { requireCustomer } from "@/server/auth/rbac";
import { guardaDePagina } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { ClienteShell } from "@/ui/app-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ClienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O proxy já redirecionou quem não tem sessão, mas a autorização de verdade
  // é esta: o layout inteiro exige papel CUSTOMER verificado no servidor (§5).
  const session = await guardaDePagina(requireCustomer);
  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { name: true },
  });

  return <ClienteShell nome={usuario.name}>{children}</ClienteShell>;
}
