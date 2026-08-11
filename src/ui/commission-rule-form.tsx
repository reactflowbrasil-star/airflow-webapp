"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Field, Input } from "@/ui";

/**
 * Criação de regra de comissão (§20).
 *
 * O percentual é digitado em % e convertido para **basis points** no envio —
 * o backend só trabalha em bps, porque 15% em ponto flutuante não é 15%.
 */
export function NovaRegraForm({
  cidades,
  categorias,
}: {
  cidades: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [escopo, setEscopo] = useState("GLOBAL");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);

    const percentual = Number(String(form.get("percentual")).replace(",", "."));
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
      setErro("Percentual deve estar entre 0 e 100");
      return;
    }

    setOcupado(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/admin/regras-comissao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("nome"),
          scope: escopo,
          // Percentual → basis points, com arredondamento explícito.
          percentBps: Math.round(percentual * 100),
          fixedFeeCents: centavos(form.get("fixo")),
          minCommissionCents: centavos(form.get("minimo")) || undefined,
          maxCommissionCents: centavos(form.get("maximo")) || undefined,
          cityId: escopo === "CITY" ? form.get("cidade") : undefined,
          categoryId: escopo === "CATEGORY" ? form.get("categoria") : undefined,
          priority: Number(form.get("prioridade") ?? 0),
        }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível criar a regra");
        return;
      }
      (evento.target as HTMLFormElement).reset();
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      {erro && <Alert tone="danger">{erro}</Alert>}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <Field label="Nome da regra" htmlFor="nome" required>
          <Input id="nome" name="nome" required placeholder="Comissão padrão 2026" />
        </Field>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="escopo" className="text-[0.8125rem] font-semibold">
            Escopo
          </label>
          <select
            id="escopo"
            name="escopo"
            value={escopo}
            onChange={(e) => setEscopo(e.target.value)}
            className="surface-card h-12 rounded-(--radius-field) px-4 text-[0.9375rem] outline-none"
          >
            <option value="GLOBAL">Global</option>
            <option value="CITY">Cidade</option>
            <option value="CATEGORY">Categoria</option>
            <option value="PROMOTIONAL">Promocional</option>
          </select>
        </div>

        {escopo === "CITY" && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="cidade" className="text-[0.8125rem] font-semibold">
              Cidade
            </label>
            <select
              id="cidade"
              name="cidade"
              className="surface-card h-12 rounded-(--radius-field) px-4 text-[0.9375rem] outline-none"
            >
              {cidades.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        {escopo === "CATEGORY" && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="categoria" className="text-[0.8125rem] font-semibold">
              Categoria
            </label>
            <select
              id="categoria"
              name="categoria"
              className="surface-card h-12 rounded-(--radius-field) px-4 text-[0.9375rem] outline-none"
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        <Field label="Percentual (%)" htmlFor="percentual" required>
          <Input
            id="percentual"
            name="percentual"
            inputMode="decimal"
            required
            placeholder="15"
            className="num"
          />
        </Field>

        <Field label="Taxa fixa (R$)" htmlFor="fixo" hint="Opcional">
          <Input id="fixo" name="fixo" inputMode="decimal" placeholder="0,00" className="num" />
        </Field>

        <Field label="Comissão mínima (R$)" htmlFor="minimo" hint="Opcional">
          <Input id="minimo" name="minimo" inputMode="decimal" placeholder="—" className="num" />
        </Field>

        <Field label="Comissão máxima (R$)" htmlFor="maximo" hint="Opcional">
          <Input id="maximo" name="maximo" inputMode="decimal" placeholder="—" className="num" />
        </Field>

        <Field
          label="Prioridade"
          htmlFor="prioridade"
          hint="Desempata regras de mesmo escopo"
        >
          <Input
            id="prioridade"
            name="prioridade"
            inputMode="numeric"
            defaultValue="0"
            className="num"
          />
        </Field>
      </div>

      <div>
        <Button type="submit" disabled={ocupado}>
          {ocupado ? "Criando…" : "Criar regra"}
        </Button>
      </div>
    </form>
  );
}

/** "1.234,56" → 123456. Vazio vira 0. */
function centavos(valor: FormDataEntryValue | null): number {
  const texto = String(valor ?? "").trim();
  if (!texto) return 0;
  const limpo = texto.replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(limpo);
  if (!match) return 0;
  return (
    Number.parseInt(match[1], 10) * 100 +
    Number.parseInt((match[2] ?? "").padEnd(2, "0") || "0", 10)
  );
}
