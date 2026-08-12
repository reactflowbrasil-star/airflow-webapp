import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { guardaDePagina } from "@/server/auth/page-guards";
import { requireSession } from "@/server/auth/rbac";
import { situacaoVerificacao } from "@/server/services/verification-service";
import { IconBox } from "@/ui";
import { VerifyForm } from "@/ui/verify-form";

export const metadata: Metadata = {
  title: "Confirme seu telefone",
  description: "Confirme o código enviado por WhatsApp para ativar sua conta na AirFlow.",
};

/**
 * Tela de verificação (§6).
 *
 * `requireSession` e não `requireCustomer`: a conta ainda está pendente, e
 * exigir verificação para chegar à tela de verificação trancaria o usuário
 * fora do único lugar onde ele pode se desbloquear.
 */
/**
 * Fora do componente porque `Date.now()` no corpo do render é chamada impura —
 * a regra existe para o resultado não variar entre renderizações da mesma
 * árvore.
 */
function segundosAte(instante: Date | null): number {
  if (!instante) return 0;
  return Math.max(0, Math.ceil((instante.getTime() - Date.now()) / 1000));
}

export default async function VerificarPage() {
  // Sem sessão vai para o login, não para uma tela de 500.
  const session = await guardaDePagina(requireSession);
  const situacao = await situacaoVerificacao(session.userId);

  if (situacao.verificado) {
    redirect(session.role === "PROVIDER" ? "/pro" : "/app");
  }

  const espera = segundosAte(situacao.pendente?.podeReenviarEm ?? null);

  return (
    <div className="flex flex-col items-center gap-6">
      <IconBox name="whatsapp-logo" size={56} tone="grad" />

      <div className="text-center">
        <h1 className="text-[clamp(24px,3.4vw,32px)] leading-[1.08] font-extrabold tracking-[-0.03em]">
          Confirme seu telefone
        </h1>
        <p className="text-secondary mt-2.5 text-sm leading-relaxed">
          {situacao.pendente ? (
            <>
              Enviamos um código por WhatsApp para{" "}
              <span className="num font-semibold">
                {situacao.pendente.telefoneMascarado}
              </span>
              .
            </>
          ) : (
            "Vamos enviar um código por WhatsApp para o número do seu cadastro."
          )}
        </p>
      </div>

      <div className="w-full max-w-sm">
        <VerifyForm
          telefone={situacao.telefone}
          jaEnviado={situacao.pendente !== null}
          segundosParaReenviar={espera}
          destinoAposConfirmacao={session.role === "PROVIDER" ? "/pro" : "/app"}
        />
      </div>

      <p className="text-muted max-w-sm text-center text-xs leading-relaxed">
        A AirFlow nunca pede seu código por telefone ou mensagem. Se alguém
        pedir, é golpe.
      </p>
    </div>
  );
}
