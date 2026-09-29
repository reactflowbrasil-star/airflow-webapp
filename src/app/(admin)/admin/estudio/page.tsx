import type { Metadata } from "next";

import { requireAdmin } from "@/server/auth/rbac";
import { lerChaveHiggsfield } from "@/server/higgsfield/credencial";
import { listarGeracoes } from "@/server/services/estudio-service";
import { AdminHeader } from "@/ui/admin-table";
import { EstudioMarketing } from "@/ui/estudio-marketing";

export const metadata: Metadata = { title: "Estúdio de marketing" };

export default async function AdminEstudioPage() {
  const session = await requireAdmin();
  const [chave, geracoes] = await Promise.all([
    lerChaveHiggsfield(session.userId),
    listarGeracoes(session.userId),
  ]);

  return (
    <div>
      <AdminHeader
        eyebrow="Plataforma"
        titulo="Estúdio de marketing"
        descricao="Imagens e vídeos de campanha gerados na Higgsfield com a sua chave de API. Cada geração é cobrada na conta Higgsfield dona da chave."
      />
      {/* Só o fato de haver chave desce ao navegador — o valor nunca. */}
      <EstudioMarketing chaveSalva={chave !== null} geracoesIniciais={geracoes} />
    </div>
  );
}
