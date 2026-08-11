"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Alert, Button, Card, Field, Input, Textarea } from "@/ui";

/**
 * Wizard de solicitação (§12).
 *
 * Mobile-first e em passos curtos: pedir tudo de uma vez numa tela só é o que
 * mais derruba conversão em formulário de orçamento. Cada passo valida antes
 * de avançar, e o cliente pode voltar sem perder o que já preencheu.
 */

export interface CategoriaOpcao {
  id: string;
  name: string;
  slug: string;
  basePriceCents: number | null;
}

export interface EnderecoOpcao {
  id: string;
  label: string;
  street: string;
  number: string;
  neighborhood: string;
  cityName: string;
  state: string;
}

export interface TecnicoAlvo {
  id: string;
  displayName: string;
  slug: string;
}

const EQUIPAMENTOS = [
  ["SPLIT", "Split"],
  ["INVERTER", "Inverter"],
  ["JANELA", "Janela"],
  ["CASSETE", "Cassete"],
  ["PISO_TETO", "Piso-teto"],
  ["MULTI_SPLIT", "Multi Split"],
  ["OUTRO", "Outro"],
] as const;

const URGENCIAS = [
  ["BAIXA", "Sem pressa"],
  ["NORMAL", "Nos próximos dias"],
  ["ALTA", "Esta semana"],
  ["EMERGENCIA", "Urgente — hoje"],
] as const;

const PASSOS = ["Serviço", "Equipamento", "Detalhes", "Local e data", "Valor"] as const;

function formatarCentavos(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/** "1.234,56" digitado → 123456 centavos, sem passar por float. */
function parseValor(texto: string): number | null {
  const limpo = texto.replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(limpo);
  if (!match) return null;
  const cents =
    Number.parseInt(match[1], 10) * 100 +
    Number.parseInt((match[2] ?? "").padEnd(2, "0") || "0", 10);
  return cents > 0 ? cents : null;
}

export function RequestWizard({
  categorias,
  enderecos,
  tecnico,
  categoriaInicial,
}: {
  categorias: CategoriaOpcao[];
  enderecos: EnderecoOpcao[];
  tecnico: TecnicoAlvo | null;
  categoriaInicial?: string;
}) {
  const router = useRouter();
  const [passo, setPasso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [categoryId, setCategoryId] = useState(categoriaInicial ?? "");
  const [equipmentType, setEquipmentType] = useState<string>("SPLIT");
  const [quantity, setQuantity] = useState(1);
  const [btus, setBtus] = useState("");
  const [brand, setBrand] = useState("");
  const [propertyType, setPropertyType] = useState<"RESIDENCIAL" | "COMERCIAL">(
    "RESIDENCIAL",
  );
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<string>("NORMAL");
  const [addressId, setAddressId] = useState(enderecos[0]?.id ?? "");
  const [desiredDate, setDesiredDate] = useState("");
  const [valor, setValor] = useState("");

  // Endereço novo, quando o cliente ainda não tem nenhum
  const [novoEndereco, setNovoEndereco] = useState({
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    cityName: "",
    state: "",
    postalCode: "",
  });
  const criandoEndereco = enderecos.length === 0 || addressId === "__novo__";

  const categoria = categorias.find((c) => c.id === categoryId) ?? null;
  const valorCents = useMemo(() => parseValor(valor), [valor]);

  const sugestao = useMemo(() => {
    if (!categoria?.basePriceCents) return null;
    return categoria.basePriceCents * quantity;
  }, [categoria, quantity]);

  function validarPasso(indice: number): string | null {
    switch (indice) {
      case 0:
        return categoryId ? null : "Escolha o serviço que você precisa";
      case 1:
        return quantity >= 1 ? null : "Informe ao menos 1 aparelho";
      case 2:
        return description.trim().length >= 10
          ? null
          : "Descreva o problema com pelo menos 10 caracteres";
      case 3:
        if (criandoEndereco) {
          const { street, number, neighborhood, cityName, state, postalCode } =
            novoEndereco;
          if (!street || !number || !neighborhood || !cityName) {
            return "Preencha rua, número, bairro e cidade";
          }
          if (state.length !== 2) return "Informe a UF com 2 letras";
          if (postalCode.replace(/\D/g, "").length !== 8) {
            return "CEP deve ter 8 dígitos";
          }
          return null;
        }
        return addressId ? null : "Escolha o endereço do atendimento";
      case 4:
        return valorCents === null ? "Informe quanto deseja pagar" : null;
      default:
        return null;
    }
  }

  function avancar() {
    const problema = validarPasso(passo);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    setPasso((p) => Math.min(p + 1, PASSOS.length - 1));
  }

  function voltar() {
    setErro(null);
    setPasso((p) => Math.max(p - 1, 0));
  }

  async function enviar() {
    const problema = validarPasso(4);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    setEnviando(true);

    try {
      let enderecoFinal = addressId;

      if (criandoEndereco) {
        const respostaEndereco = await fetch("/api/enderecos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...novoEndereco, isDefault: true }),
        });
        const corpoEndereco = await respostaEndereco.json();
        if (!respostaEndereco.ok) {
          setErro(corpoEndereco?.error?.message ?? "Não foi possível salvar o endereço");
          return;
        }
        enderecoFinal = corpoEndereco.address.id;
      }

      const resposta = await fetch("/api/solicitacoes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          categoryId,
          addressId: enderecoFinal,
          equipmentType,
          quantity,
          btus: btus ? Number(btus) : undefined,
          brand: brand || undefined,
          propertyType,
          description,
          urgency,
          desiredDate: desiredDate || undefined,
          proposedPriceCents: valorCents,
          providerId: tecnico?.id,
        }),
      });
      const corpo = await resposta.json();

      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível enviar a solicitação");
        return;
      }

      router.push(`/app/solicitacoes/${corpo.request.id}`);
      router.refresh();
    } catch {
      setErro("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      {/* Progresso */}
      <ol className="mb-6 flex gap-1.5" aria-label="Etapas">
        {PASSOS.map((nome, i) => (
          <li key={nome} className="flex-1">
            <div
              className={`h-1.5 rounded-full transition-colors ${
                i <= passo ? "bg-brand-600" : "bg-[var(--surface-border)]"
              }`}
            />
            <span className={`mt-1.5 block text-[0.6875rem] ${i === passo ? "font-medium" : "text-muted"}`}>
              {nome}
            </span>
          </li>
        ))}
      </ol>

      {tecnico && (
        <Alert tone="brand">
          Solicitação dirigida a <strong>{tecnico.displayName}</strong>. Ele receberá
          sua proposta assim que você enviar.
        </Alert>
      )}

      <Card className="mt-4 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">{PASSOS[passo]}</h2>

        <div className="mt-5 flex flex-col gap-4">
          {passo === 0 && (
            <fieldset>
              <legend className="sr-only">Serviço</legend>
              <div className="flex flex-col gap-2">
                {categorias.map((c) => (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-(--radius-field) border p-3.5 transition-colors ${
                      categoryId === c.id
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
                        : "surface-card hover:bg-[var(--surface-muted)]"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="categoria"
                        value={c.id}
                        checked={categoryId === c.id}
                        onChange={() => setCategoryId(c.id)}
                        className="accent-brand-600 h-4 w-4"
                      />
                      <span className="font-medium">{c.name}</span>
                    </span>
                    {c.basePriceCents !== null && (
                      <span className="text-muted shrink-0 text-xs">
                        a partir de {formatarCentavos(c.basePriceCents)}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {passo === 1 && (
            <>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Tipo de aparelho</legend>
                <div className="flex flex-wrap gap-2">
                  {EQUIPAMENTOS.map(([valorEq, rotulo]) => (
                    <label
                      key={valorEq}
                      className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors ${
                        equipmentType === valorEq
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "surface-card hover:border-brand-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="equipamento"
                        value={valorEq}
                        checked={equipmentType === valorEq}
                        onChange={() => setEquipmentType(valorEq)}
                        className="sr-only"
                      />
                      {rotulo}
                    </label>
                  ))}
                </div>
              </fieldset>

              <Field label="Quantos aparelhos?" htmlFor="quantity" required>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    aria-label="Diminuir quantidade"
                    className="surface-card h-11 w-11 rounded-(--radius-field) text-lg"
                  >
                    −
                  </button>
                  <Input
                    id="quantity"
                    type="number"
                    min={1}
                    max={50}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                    className="w-20 text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                    aria-label="Aumentar quantidade"
                    className="surface-card h-11 w-11 rounded-(--radius-field) text-lg"
                  >
                    +
                  </button>
                </div>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="BTUs" htmlFor="btus" hint="Se você souber">
                  <Input
                    id="btus"
                    type="number"
                    inputMode="numeric"
                    value={btus}
                    onChange={(e) => setBtus(e.target.value)}
                    placeholder="Ex.: 12000"
                  />
                </Field>
                <Field label="Marca" htmlFor="brand" hint="Opcional">
                  <Input
                    id="brand"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Ex.: Samsung"
                  />
                </Field>
              </div>
            </>
          )}

          {passo === 2 && (
            <>
              <Field
                label="Descreva o que está acontecendo"
                htmlFor="description"
                required
                hint="Quanto mais detalhes, mais precisa será a proposta do técnico"
              >
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: O ar da sala não está gelando e faz um barulho alto quando liga."
                />
              </Field>

              <fieldset>
                <legend className="mb-2 text-sm font-medium">Tipo de imóvel</legend>
                <div className="flex gap-2">
                  {(["RESIDENCIAL", "COMERCIAL"] as const).map((tipo) => (
                    <label
                      key={tipo}
                      className={`flex-1 cursor-pointer rounded-(--radius-field) border p-3 text-center text-sm transition-colors ${
                        propertyType === tipo
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "surface-card hover:border-brand-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="imovel"
                        checked={propertyType === tipo}
                        onChange={() => setPropertyType(tipo)}
                        className="sr-only"
                      />
                      {tipo === "RESIDENCIAL" ? "Residencial" : "Comercial"}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {passo === 3 && (
            <>
              {enderecos.length > 0 && (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">
                    Onde será o atendimento?
                  </legend>
                  <div className="flex flex-col gap-2">
                    {enderecos.map((e) => (
                      <label
                        key={e.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-(--radius-field) border p-3.5 transition-colors ${
                          addressId === e.id
                            ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
                            : "surface-card hover:bg-[var(--surface-muted)]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="endereco"
                          checked={addressId === e.id}
                          onChange={() => setAddressId(e.id)}
                          className="accent-brand-600 mt-0.5 h-4 w-4"
                        />
                        <span className="text-sm">
                          <span className="font-medium">{e.label}</span>
                          <br />
                          <span className="text-secondary">
                            {e.street}, {e.number} — {e.neighborhood}, {e.cityName}/
                            {e.state}
                          </span>
                        </span>
                      </label>
                    ))}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-(--radius-field) border p-3.5 text-sm transition-colors ${
                        addressId === "__novo__"
                          ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
                          : "surface-card hover:bg-[var(--surface-muted)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="endereco"
                        checked={addressId === "__novo__"}
                        onChange={() => setAddressId("__novo__")}
                        className="accent-brand-600 h-4 w-4"
                      />
                      Usar outro endereço
                    </label>
                  </div>
                </fieldset>
              )}

              {criandoEndereco && (
                <div className="flex flex-col gap-3">
                  {enderecos.length === 0 && (
                    <p className="text-secondary text-sm">
                      Informe onde o técnico deve atender.
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                    <Field label="Rua" htmlFor="street" required>
                      <Input
                        id="street"
                        value={novoEndereco.street}
                        onChange={(e) =>
                          setNovoEndereco({ ...novoEndereco, street: e.target.value })
                        }
                        autoComplete="address-line1"
                      />
                    </Field>
                    <Field label="Número" htmlFor="number" required>
                      <Input
                        id="number"
                        value={novoEndereco.number}
                        onChange={(e) =>
                          setNovoEndereco({ ...novoEndereco, number: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Complemento" htmlFor="complement">
                    <Input
                      id="complement"
                      value={novoEndereco.complement}
                      onChange={(e) =>
                        setNovoEndereco({ ...novoEndereco, complement: e.target.value })
                      }
                      placeholder="Apto, bloco…"
                    />
                  </Field>
                  <Field label="Bairro" htmlFor="neighborhood" required>
                    <Input
                      id="neighborhood"
                      value={novoEndereco.neighborhood}
                      onChange={(e) =>
                        setNovoEndereco({ ...novoEndereco, neighborhood: e.target.value })
                      }
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-[1fr_90px_140px]">
                    <Field label="Cidade" htmlFor="cityName" required>
                      <Input
                        id="cityName"
                        value={novoEndereco.cityName}
                        onChange={(e) =>
                          setNovoEndereco({ ...novoEndereco, cityName: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="UF" htmlFor="state" required>
                      <Input
                        id="state"
                        maxLength={2}
                        value={novoEndereco.state}
                        onChange={(e) =>
                          setNovoEndereco({
                            ...novoEndereco,
                            state: e.target.value.toUpperCase(),
                          })
                        }
                      />
                    </Field>
                    <Field label="CEP" htmlFor="postalCode" required>
                      <Input
                        id="postalCode"
                        inputMode="numeric"
                        value={novoEndereco.postalCode}
                        onChange={(e) =>
                          setNovoEndereco({ ...novoEndereco, postalCode: e.target.value })
                        }
                        placeholder="00000-000"
                      />
                    </Field>
                  </div>
                </div>
              )}

              <Field label="Data desejada" htmlFor="desiredDate" hint="Opcional">
                <Input
                  id="desiredDate"
                  type="date"
                  value={desiredDate}
                  onChange={(e) => setDesiredDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </Field>

              <fieldset>
                <legend className="mb-2 text-sm font-medium">Urgência</legend>
                <div className="flex flex-wrap gap-2">
                  {URGENCIAS.map(([valorU, rotulo]) => (
                    <label
                      key={valorU}
                      className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors ${
                        urgency === valorU
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "surface-card hover:border-brand-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="urgencia"
                        checked={urgency === valorU}
                        onChange={() => setUrgency(valorU)}
                        className="sr-only"
                      />
                      {rotulo}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {passo === 4 && (
            <>
              <Field
                label="Quanto deseja pagar?"
                htmlFor="valor"
                required
                hint="Este é o valor que você propõe. O técnico pode aceitar ou fazer uma contraproposta."
              >
                <div className="flex items-center gap-2">
                  <span className="text-secondary text-lg font-medium">R$</span>
                  <Input
                    id="valor"
                    inputMode="decimal"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="250,00"
                    className="text-lg"
                  />
                </div>
              </Field>

              {sugestao !== null && (
                <button
                  type="button"
                  onClick={() => setValor((sugestao / 100).toFixed(2).replace(".", ","))}
                  className="text-brand-600 self-start text-sm hover:underline"
                >
                  Usar a referência da plataforma: {formatarCentavos(sugestao)}
                </button>
              )}

              {/* Resumo antes de enviar */}
              <div className="bg-[var(--surface-muted)] mt-2 rounded-(--radius-field) p-4">
                <h3 className="text-sm font-semibold">Resumo</h3>
                <dl className="mt-2 flex flex-col gap-1 text-sm">
                  <Linha rotulo="Serviço" valor={categoria?.name ?? "—"} />
                  <Linha
                    rotulo="Equipamento"
                    valor={`${quantity}× ${
                      EQUIPAMENTOS.find(([v]) => v === equipmentType)?.[1] ?? ""
                    }${btus ? ` · ${btus} BTUs` : ""}`}
                  />
                  <Linha
                    rotulo="Urgência"
                    valor={URGENCIAS.find(([v]) => v === urgency)?.[1] ?? "—"}
                  />
                  {valorCents !== null && (
                    <div className="border-[var(--surface-border)] mt-1 flex justify-between border-t pt-2">
                      <dt className="font-medium">Sua proposta</dt>
                      <dd className="text-brand-700 dark:text-brand-300 font-bold">
                        {formatarCentavos(valorCents)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <p className="text-muted text-xs leading-relaxed">
                Você só paga depois que o valor for aceito. O dinheiro fica retido na
                plataforma e é liberado ao técnico após o serviço concluído.
              </p>
            </>
          )}
        </div>

        {erro && (
          <div className="mt-4">
            <Alert tone="danger">{erro}</Alert>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          {passo > 0 && (
            <Button variant="secondary" onClick={voltar} disabled={enviando}>
              Voltar
            </Button>
          )}
          {passo < PASSOS.length - 1 ? (
            <Button onClick={avancar} fullWidth>
              Continuar
            </Button>
          ) : (
            <Button onClick={enviar} fullWidth disabled={enviando}>
              {enviando ? "Enviando…" : "Enviar solicitação"}
            </Button>
          )}
        </div>
      </Card>

      <p className="text-muted mt-4 text-center text-xs">
        Etapa {passo + 1} de {PASSOS.length}
      </p>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-secondary">{rotulo}</dt>
      <dd className="text-right">{valor}</dd>
    </div>
  );
}
