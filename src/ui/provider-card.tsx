"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge, ButtonLink, Rating } from "@/ui";

/**
 * Card de técnico expansível (handoff, tela 2).
 *
 * Fechado mostra o essencial para comparar; aberto revela especialidades,
 * métricas e os dois CTAs. O botão que expande é um <button> de verdade com
 * aria-expanded — a área extra é conteúdo, não decoração, e precisa existir
 * para teclado e leitor de tela.
 */

export interface TecnicoCard {
  id: string;
  slug: string;
  displayName: string;
  bio: string | null;
  verified: boolean;
  cidade: string | null;
  bairro: string | null;
  distanciaKm: number | null;
  ratingAverage: number;
  ratingCount: number;
  completedServices: number;
  yearsOfExperience: number | null;
  avgResponseMinutes: number | null;
  aPartirDeCents: number | null;
  servicos: string[];
  posicaoMapa: { x: number; y: number };
}

function formatar(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function ProviderCard({ tecnico }: { tecnico: TecnicoCard }) {
  const [aberto, setAberto] = useState(false);
  const painelId = `tecnico-${tecnico.id}`;

  return (
    <div
      className={`surface-card rounded-(--radius-card) p-5 shadow-(--shadow-subtle) transition-all duration-350 ${
        aberto
          ? "-translate-y-[3px] border-[var(--accent)] shadow-(--shadow-float)"
          : "hover:border-[var(--accent-border)]"
      }`}
    >
      <div className="flex items-start gap-3.5">
        <span className="bg-grad grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full text-lg font-bold text-white">
          {tecnico.displayName.slice(0, 1)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-bold tracking-[-0.02em]">
              <Link
                href={`/tecnico/${tecnico.slug}`}
                className="transition-colors hover:text-[var(--accent-text)]"
              >
                {tecnico.displayName}
              </Link>
            </h2>
            {tecnico.verified && <Badge tone="success">Verificado</Badge>}
          </div>

          <p className="text-muted mt-1 truncate text-[0.8125rem]">
            {[tecnico.bairro, tecnico.cidade].filter(Boolean).join(", ") ||
              "Região não informada"}
            {tecnico.distanciaKm !== null && (
              <span className="num"> · ~{tecnico.distanciaKm} km</span>
            )}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            {tecnico.ratingCount > 0 ? (
              <Rating value={tecnico.ratingAverage} count={tecnico.ratingCount} />
            ) : (
              <span className="text-muted text-sm">Sem avaliações ainda</span>
            )}
            <span className="num text-secondary text-sm">
              {tecnico.completedServices} serviços
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={painelId}
          className={`accent-soft grid h-9 w-9 shrink-0 place-items-center rounded-full border text-[var(--accent-text)] transition-transform duration-350 ${
            aberto ? "rotate-180" : ""
          }`}
        >
          <span aria-hidden="true">⌄</span>
          <span className="sr-only">
            {aberto ? "Recolher detalhes de" : "Ver detalhes de"} {tecnico.displayName}
          </span>
        </button>
      </div>

      {tecnico.bio && (
        <p className="text-secondary mt-3.5 line-clamp-2 text-[0.875rem] leading-relaxed">
          {tecnico.bio}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3.5">
        <p className="text-muted text-[0.8125rem]">
          {tecnico.aPartirDeCents !== null ? (
            <>
              a partir de{" "}
              <span className="num font-bold text-[var(--accent-text)]">
                {formatar(tecnico.aPartirDeCents)}
              </span>
            </>
          ) : (
            "Preço sob orçamento"
          )}
        </p>
      </div>

      {aberto && (
        <div id={painelId} className="anim-expand mt-4 border-t pt-4">
          {tecnico.servicos.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {tecnico.servicos.slice(0, 5).map((servico) => (
                <li
                  key={servico}
                  className="surface-muted rounded-(--radius-pill) px-3 py-1.5 text-xs font-medium"
                >
                  {servico}
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-4 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(96px,1fr))]">
            <Metrica
              rotulo="Responde em"
              valor={
                tecnico.avgResponseMinutes !== null
                  ? `${tecnico.avgResponseMinutes} min`
                  : "—"
              }
            />
            <Metrica
              rotulo="Distância"
              valor={tecnico.distanciaKm !== null ? `~${tecnico.distanciaKm} km` : "—"}
            />
            <Metrica
              rotulo="Experiência"
              valor={
                tecnico.yearsOfExperience !== null
                  ? `${tecnico.yearsOfExperience} anos`
                  : "—"
              }
            />
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href={`/tecnico/${tecnico.slug}`} size="sm">
              Ver perfil
            </ButtonLink>
            <ButtonLink
              href={`/app/solicitar?tecnico=${tecnico.slug}`}
              size="sm"
              variant="secondary"
            >
              Pedir orçamento
            </ButtonLink>
          </div>
        </div>
      )}
    </div>
  );
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="surface-muted min-w-0 rounded-[14px] px-3 py-2.5">
      <dt className="text-muted text-[0.625rem] tracking-[0.08em] uppercase">{rotulo}</dt>
      <dd className="num mt-1 text-[0.8125rem] font-bold">{valor}</dd>
    </div>
  );
}
