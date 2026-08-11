"use client";

import Link from "next/link";
import { useState } from "react";

import { ProviderCard, type TecnicoCard } from "@/ui/provider-card";

export function ProviderSearchResults({ tecnicos }: { tecnicos: TecnicoCard[] }) {
  const [visualizacao, setVisualizacao] = useState<"lista" | "mapa">("lista");
  const [selecionado, setSelecionado] = useState(tecnicos[0]?.id ?? "");
  const tecnicoSelecionado = tecnicos.find((tecnico) => tecnico.id === selecionado) ?? tecnicos[0];

  return (
    <section className="mt-6" aria-label="Resultados da busca">
      <div className="mb-4 flex justify-end">
        <div className="surface-card inline-flex rounded-(--radius-pill) border p-1" aria-label="Visualização dos resultados">
          <BotaoVisualizacao ativo={visualizacao === "lista"} onClick={() => setVisualizacao("lista")}>
            Lista
          </BotaoVisualizacao>
          <BotaoVisualizacao ativo={visualizacao === "mapa"} onClick={() => setVisualizacao("mapa")}>
            Mapa
          </BotaoVisualizacao>
        </div>
      </div>

      {visualizacao === "lista" ? (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]">
          {tecnicos.map((tecnico) => (
            <li key={tecnico.id} className="min-w-0">
              <ProviderCard tecnico={tecnico} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="surface-card relative min-h-[430px] overflow-hidden rounded-(--radius-card) border shadow-(--shadow-subtle)">
            <div className="absolute inset-0 opacity-45" aria-hidden="true" style={{
              backgroundImage: "linear-gradient(var(--surface-border) 1px, transparent 1px), linear-gradient(90deg, var(--surface-border) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
            }} />
            <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 bg-linear-to-b from-[var(--surface-card)] via-[var(--surface-card)]/90 to-transparent p-5 pb-12">
              <div>
                <p className="font-bold">Mapa aproximado da região</p>
                <p className="text-muted mt-1 max-w-md text-xs leading-relaxed">
                  Os marcadores ajudam a comparar regiões e não representam o endereço do técnico.
                </p>
              </div>
              <span className="accent-soft rounded-(--radius-pill) border px-3 py-1 text-xs font-semibold text-[var(--accent-text)]">
                {tecnicos.length} nesta página
              </span>
            </div>

            {tecnicos.map((tecnico, indice) => {
              const ativo = tecnico.id === tecnicoSelecionado?.id;
              return (
                <button
                  key={tecnico.id}
                  type="button"
                  onClick={() => setSelecionado(tecnico.id)}
                  aria-label={`Selecionar ${tecnico.displayName} no mapa`}
                  aria-pressed={ativo}
                  className={`absolute z-20 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 font-bold shadow-(--shadow-raised) transition-all hover:scale-110 ${
                    ativo ? "bg-grad scale-110 border-white text-white" : "surface-card border-[var(--accent-border)] text-[var(--accent-text)]"
                  }`}
                  style={{ left: `${tecnico.posicaoMapa.x}%`, top: `${tecnico.posicaoMapa.y}%` }}
                >
                  {indice + 1}
                </button>
              );
            })}
          </div>

          {tecnicoSelecionado && (
            <aside className="surface-card rounded-(--radius-card) border p-5 shadow-(--shadow-subtle)" aria-live="polite">
              <span className="bg-grad grid h-12 w-12 place-items-center rounded-full text-lg font-bold text-white">
                {tecnicoSelecionado.displayName.slice(0, 1)}
              </span>
              <h2 className="mt-4 text-lg font-bold">{tecnicoSelecionado.displayName}</h2>
              <p className="text-muted mt-1 text-sm">
                {[tecnicoSelecionado.bairro, tecnicoSelecionado.cidade].filter(Boolean).join(", ") || "Região não informada"}
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-2">
                <Metrica rotulo="Avaliação" valor={tecnicoSelecionado.ratingCount > 0 ? tecnicoSelecionado.ratingAverage.toFixed(1) : "Nova"} />
                <Metrica rotulo="Distância" valor={tecnicoSelecionado.distanciaKm !== null ? `~${tecnicoSelecionado.distanciaKm} km` : "—"} />
              </dl>
              <Link href={`/tecnico/${tecnicoSelecionado.slug}`} className="bg-grad mt-5 block rounded-(--radius-pill) px-5 py-3 text-center text-sm font-semibold text-white">
                Ver perfil
              </Link>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}

function BotaoVisualizacao({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} className={`rounded-(--radius-pill) px-4 py-2 text-sm font-semibold transition-colors ${ativo ? "bg-grad text-white" : "text-secondary hover:text-[var(--text-primary)]"}`}>
      {children}
    </button>
  );
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="surface-muted rounded-[14px] p-3">
      <dt className="text-muted text-[0.625rem] uppercase tracking-[0.08em]">{rotulo}</dt>
      <dd className="num mt-1 font-bold">{valor}</dd>
    </div>
  );
}
