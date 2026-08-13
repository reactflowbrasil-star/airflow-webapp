"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Icon } from "@/ui";
import { DashboardShell } from "@/ui/dashboard-shell";
import type { GrupoNav } from "@/ui/dashboard-shell";

/**
 * Painel do cliente (`/app`). A navegação passou a ser por grupos acordeon
 * (Início, Serviços, Mensagens, Conta) no mesmo shell compartilhado do
 * prestador — a antiga barra inferior fixa e o rail simples foram
 * substituídos pelo drawer com hambúrguer no mobile.
 */

export const GRUPOS_CLIENTE: readonly GrupoNav[] = [
  {
    rotulo: "Início",
    itens: [{ href: "/app", rotulo: "Visão geral", icone: "trend-up" }],
  },
  {
    rotulo: "Serviços",
    itens: [
      { href: "/tecnicos", rotulo: "Buscar técnicos", icone: "map-pin" },
      { href: "/app/solicitar", rotulo: "Nova solicitação", icone: "plus-circle" },
      { href: "/app/solicitacoes", rotulo: "Minhas solicitações", icone: "note-pencil" },
    ],
  },
  {
    rotulo: "Mensagens",
    itens: [{ href: "/app/mensagens", rotulo: "Mensagens", icone: "chats-circle" }],
  },
  {
    rotulo: "Conta",
    itens: [{ href: "/app/perfil", rotulo: "Perfil", icone: "user-circle" }],
  },
];

export function ClienteShell({
  nome,
  children,
}: {
  nome: string;
  children: ReactNode;
}) {
  return (
    <DashboardShell nome={nome} grupos={GRUPOS_CLIENTE} rodape={<LogoutButton />}>
      {children}
    </DashboardShell>
  );
}

export function LogoutButton() {
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
