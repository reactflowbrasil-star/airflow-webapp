import type { Metadata } from "next";

import { requireProvider } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Badge, Card, Icon, IconBox } from "@/ui";
import { FacialVerification } from "@/ui/facial-verification";
import { SeloVerificado } from "@/ui/selo-verificado";

export const metadata: Metadata = { title: "Validação facial — VERIFICADO" };

export const dynamic = "force-dynamic";

export default async function ValidacaoFacialPage() {
  const session = await requireProvider();

  const [perfil, selfie] = await Promise.all([
    prisma.providerProfile.findUniqueOrThrow({
      where: { id: session.providerProfileId },
      select: { displayName: true, status: true, verified: true },
    }),
    prisma.providerDocument.findFirst({
      where: { providerId: session.providerProfileId, type: "SELFIE" },
      orderBy: { createdAt: "desc" },
      select: { status: true, reviewedAt: true },
    }),
  ]);

  const jaVerificado = selfie?.status === "APROVADO";
  const modo =
    process.env.FACIAL_BIOMETRIA_PROVIDER === "unico" ? ("real" as const) : ("sandbox" as const);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="eyebrow text-[var(--accent-text)]">Confiabilidade</p>
        <h1 className="mt-2.5 text-[clamp(24px,3.4vw,34px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
          Validação facial
        </h1>
      </div>

      <Card className="accent-soft border p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <IconBox name="shield-check" size={52} />
            <div>
              <h2 className="font-extrabold tracking-[-0.02em]">
                Nível de confiabilidade VERIFICADO
              </h2>
              <p className="text-muted mt-1 text-sm">
                {perfil.displayName} —{" "}
                <Badge tone={perfil.status === "APROVADO" ? "success" : "warning"}>
                  {perfil.status}
                </Badge>
              </p>
            </div>
          </div>
          {jaVerificado ? (
            <SeloVerificado destaque />
          ) : (
            <Badge tone="warning">Biometria pendente</Badge>
          )}
        </div>

        <div className="mt-6 border-t border-[var(--surface-border)] pt-5">
          <FacialVerification jaVerificado={jaVerificado} modo={modo} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-[-0.02em]">
          <Icon name="lock-simple" className="text-[var(--accent-text)] text-lg" />
          Como funciona
        </h2>
        <ol className="mt-4 flex flex-col gap-3 text-sm">
          {[
            "Você inicia a validação e autoriza o acesso à câmera.",
            "Posicione o rosto no quadro e capture a selfie.",
            "A selfie passa por análise biométrica: liveness (prova de vida) e verificação facial.",
            "Aprovada, o selo VERIFICADO é exibido no seu perfil, no dashboard e na ficha pública.",
          ].map((passo, indice) => (
            <li key={passo} className="flex items-start gap-3">
              <span className="accent-soft grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-[var(--accent-text)]">
                {indice + 1}
              </span>
              <span className="text-secondary leading-relaxed">{passo}</span>
            </li>
          ))}
        </ol>
        <p className="text-muted mt-4 text-xs leading-relaxed">
          Sua selfie é tratada como dado biométrico: fica registrada apenas no
          documento SELFIE do seu cadastro (LGPD), não é compartilhada entre as
          partes do marketplace e nunca aparece em logs.
        </p>
      </Card>
    </div>
  );
}
