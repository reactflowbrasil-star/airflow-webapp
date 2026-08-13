"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Badge, Icon, LiveDot } from "@/ui";
import { DashboardShell } from "@/ui/dashboard-shell";
import type { GrupoNav } from "@/ui/dashboard-shell";

/**
 * Painel do prestador (`/pro`). Mesmo shell do cliente — por grupos acordeon
 * (Operação, Comunicação, Financeiro, Conta) — para o produto não ter dois
 * padrões de navegação. O status de recebimento continua visível como badge
 * no perfil do painel (e no header mobile).
 */

export const GRUPOS_PRESTADOR: readonly GrupoNav[] = [
  {
    rotulo: "Operação",
    itens: [
      { href: "/pro", rotulo: "Visão geral", icone: "trend-up" },
      { href: "/pro/solicitacoes", rotulo: "Solicitações", icone: "tray-arrow-down" },
      { href: "/pro/agenda", rotulo: "Agenda", icone: "calendar-dots" },
    ],
  },
  {
    rotulo: "Comunicação",
    itens: [{ href: "/pro/mensagens", rotulo: "Mensagens", icone: "chats-circle" }],
  },
  {
    rotulo: "Financeiro",
    itens: [{ href: "/pro/financeiro", rotulo: "Financeiro", icone: "receipt" }],
  },
  {
    rotulo: "Conta",
    itens: [
      { href: "/pro/perfil", rotulo: "Perfil", icone: "user-circle" },
      {
        href: "/pro/verificacao/facial",
        rotulo: "Verificação",
        icone: "shield-check",
      },
    ],
  },
];

export function PrestadorShell({
  nome,
  recebendo,
  children,
}: {
  nome: string;
  /** `true` quando o perfil está APROVADO e recebendo solicitações. */
  recebendo: boolean;
  children: ReactNode;
}) {
  return (
    <DashboardShell
      nome={nome}
      badge={
        <Badge tone={recebendo ? "success" : "warning"}>
          <LiveDot />
          {recebendo ? "Recebendo solicitações" : "Cadastro em análise"}
        </Badge>
      }
      grupos={GRUPOS_PRESTADOR}
      rodape={<ProviderLogoutButton />}
    >
      {children}
    </DashboardShell>
  );
}

export function ProviderLogoutButton() {
  const router = useRouter();

  async function sair() {
    await fetch("/api/auth/sair", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={sair}
      className="text-secondary flex w-full items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-sm transition-colors hover:bg-[var(--surface-muted)] hover:text-danger-700"
    >
      <Icon name="sign-out" className="text-lg" />
      Sair
    </button>
  );
}
