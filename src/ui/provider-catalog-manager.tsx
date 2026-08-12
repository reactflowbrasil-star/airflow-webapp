"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert, Badge, Button, Field, Input, Textarea } from "@/ui";

interface Category { id: string; name: string }
interface Service {
  id: string;
  categoryId: string;
  categoryName: string;
  fromPriceCents: number;
  description: string | null;
  active: boolean;
}
interface PortfolioItem {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string;
}

export function ProviderCatalogManager({
  categories,
  services,
  portfolio,
}: {
  categories: Category[];
  services: Service[];
  portfolio: PortfolioItem[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editando, setEditando] = useState<Service | null>(null);

  async function send(payload: Record<string, unknown>, message: string) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/prestador/catalogo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Não foi possível atualizar o catálogo");
        return false;
      }
      setSuccess(message);
      router.refresh();
      return true;
    } catch {
      setError("Falha de conexão. Tente novamente.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (await send({
      action: "SAVE_SERVICE",
      categoryId: data.get("categoryId"),
      fromPriceCents: data.get("price"),
      description: data.get("serviceDescription") || undefined,
    }, editando ? "Serviço atualizado." : "Serviço salvo e disponível no perfil.")) {
      form.reset();
      setEditando(null);
    }
  }

  async function addPortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (await send({
      action: "ADD_PORTFOLIO",
      title: data.get("title"),
      description: data.get("portfolioDescription") || undefined,
      imageUrl: data.get("imageUrl"),
    }, "Trabalho adicionado ao portfólio.")) form.reset();
  }

  return (
    <div className="flex flex-col gap-8">
      {error && <Alert tone="danger">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      <section>
        <h2 className="font-bold">Meus serviços</h2>
        {services.length === 0 ? (
          <p className="text-muted mt-2 text-sm">Cadastre ao menos um serviço para aparecer nas buscas.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {services.map((service) => (
              <li key={service.id} className="surface-muted rounded-[8px] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{service.categoryName}</h3>
                      <Badge tone={service.active ? "success" : "neutral"}>
                        {service.active ? "Ativo" : "Pausado"}
                      </Badge>
                    </div>
                    <p className="num mt-1 text-sm font-bold text-[var(--accent-text)]">
                      A partir de {(service.fromPriceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                    {service.description && <p className="text-secondary mt-1 text-sm">{service.description}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setEditando(service)}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => send({ action: "SET_SERVICE_ACTIVE", serviceId: service.id, active: !service.active }, service.active ? "Serviço pausado." : "Serviço reativado.")}
                    >
                      {service.active ? "Pausar" : "Reativar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => send({ action: "REMOVE_SERVICE", serviceId: service.id }, "Serviço removido.")}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          key={editando?.id ?? "novo"}
          onSubmit={saveService}
          className="mt-5 grid gap-4 sm:grid-cols-2"
        >
          {editando && (
            <p className="text-secondary text-sm sm:col-span-2">
              Editando <strong>{editando.categoryName}</strong> — salvar grava sobre o
              serviço existente.
            </p>
          )}
          <Field label="Categoria" htmlFor="categoryId" required>
            <select
              id="categoryId"
              name="categoryId"
              className="surface-card h-12 rounded-(--radius-field) px-4 text-sm"
              required
              defaultValue={editando?.categoryId ?? ""}
            >
              <option value="">Selecione</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <Field label="Preço a partir de" htmlFor="price" required hint="Ex.: 180,00">
            <Input
              id="price"
              name="price"
              inputMode="decimal"
              placeholder="180,00"
              required
              defaultValue={
                editando
                  ? (editando.fromPriceCents / 100).toFixed(2).replace(".", ",")
                  : undefined
              }
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descrição" htmlFor="serviceDescription">
              <Textarea
                id="serviceDescription"
                name="serviceDescription"
                maxLength={500}
                defaultValue={editando?.description ?? undefined}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {editando ? "Salvar alterações" : "Salvar serviço"}
            </Button>
            {editando && (
              <Button type="button" variant="ghost" onClick={() => setEditando(null)} disabled={busy}>
                Cancelar edição
              </Button>
            )}
          </div>
        </form>
      </section>

      <section className="border-t border-[var(--surface-border)] pt-6">
        <h2 className="font-bold">Portfólio</h2>
        {portfolio.length > 0 && (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {portfolio.map((item) => (
              <li key={item.id} className="surface-muted rounded-[8px] p-4">
                <h3 className="font-semibold">{item.title}</h3>
                {item.description && <p className="text-secondary mt-1 line-clamp-2 text-sm">{item.description}</p>}
                <a href={item.imageUrl} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs text-[var(--accent-text)] hover:underline">Ver imagem</a>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => send({ action: "REMOVE_PORTFOLIO", itemId: item.id }, "Item removido do portfólio.")}
                >
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addPortfolio} className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Título do trabalho" htmlFor="portfolioTitle" required>
            <Input id="portfolioTitle" name="title" minLength={3} maxLength={120} required />
          </Field>
          <Field label="Imagem HTTPS" htmlFor="imageUrl" required>
            <Input id="imageUrl" name="imageUrl" type="url" placeholder="https://..." required />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descrição" htmlFor="portfolioDescription">
              <Textarea id="portfolioDescription" name="portfolioDescription" maxLength={500} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={busy}>Adicionar ao portfólio</Button>
        </form>
      </section>
    </div>
  );
}
