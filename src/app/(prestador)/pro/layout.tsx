import type { Metadata } from "next";

import { requireProvider } from "@/server/auth/rbac";
import { guardaDePagina } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { PrestadorShell } from "@/ui/provider-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PrestadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Autorização real: o layout inteiro exige papel PROVIDER no servidor (§5).
  const session = await guardaDePagina(requireProvider);
  const perfil = await prisma.providerProfile.findUniqueOrThrow({
    where: { id: session.providerProfileId },
    select: { displayName: true, status: true },
  });

  const recebendo = perfil.status === "APROVADO";

  return (
    <PrestadorShell nome={perfil.displayName} recebendo={recebendo}>
      {children}
    </PrestadorShell>
  );
}
