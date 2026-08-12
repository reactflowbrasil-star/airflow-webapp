"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert, Badge, Button, Field, Input } from "@/ui";

const DOCUMENTOS = [
  ["RG", "RG ou documento de identidade"],
  ["CNH", "CNH"],
  ["CPF", "CPF"],
  ["CNPJ", "CNPJ"],
  ["COMPROVANTE_ENDERECO", "Comprovante de endereço"],
  ["CERTIFICADO_TECNICO", "Certificado técnico"],
  ["SELFIE", "Selfie com documento"],
] as const;

interface Documento {
  id: string;
  type: string;
  status: string;
  fileName: string;
  rejectionReason: string | null;
}

export function ProviderOnboarding({
  status,
  personType,
  taxId,
  companyName,
  yearsOfExperience,
  neighborhood,
  serviceRadiusKm,
  documents,
  rejectionReason,
}: {
  status: string;
  personType: "PF" | "PJ";
  taxId: string;
  companyName: string;
  yearsOfExperience: number | null;
  neighborhood: string;
  serviceRadiusKm: number;
  documents: Documento[];
  rejectionReason: string | null;
}) {
  const router = useRouter();
  const editable = status === "INCOMPLETO" || status === "REJEITADO";
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/prestador/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Não foi possível salvar o onboarding");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Falha de conexão. Tente novamente.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await send({
      action: "UPDATE_PROFILE",
      personType: data.get("personType"),
      taxId: data.get("taxId"),
      companyName: data.get("companyName") || undefined,
      yearsOfExperience: data.get("yearsOfExperience"),
      neighborhood: data.get("neighborhood"),
      serviceRadiusKm: data.get("serviceRadiusKm"),
    });
    if (saved) setSuccess("Dados profissionais salvos.");
  }

  async function addDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Selecione uma imagem para enviar.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Envie uma imagem JPG, PNG ou WEBP.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = new FormData();
      payload.set("action", "ADD_DOCUMENT");
      payload.set("type", String(data.get("type") ?? ""));
      payload.set("file", file);

      const response = await fetch("/api/prestador/onboarding", {
        method: "POST",
        body: payload,
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Não foi possível enviar o documento");
        return;
      }

      form.reset();
      if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview);
      setSelectedImage(null);
      setSelectedImagePreview(null);
      router.refresh();
      setSuccess("Documento enviado para análise.");
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const latest = new Map<string, Documento>();
  for (const document of documents) {
    if (!latest.has(document.type)) latest.set(document.type, document);
  }
  const required = [
    personType === "PF" ? "CPF" : "CNPJ",
    "RG",
    "COMPROVANTE_ENDERECO",
    "CERTIFICADO_TECNICO",
    "SELFIE",
  ];
  const complete = required.every((type) => latest.has(type));

  return (
    <div className="flex flex-col gap-6">
      {rejectionReason && (
        <Alert tone="danger" title="Revisão solicitada">
          {rejectionReason}
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {editable && (
        <form onSubmit={saveProfile} className="flex flex-col gap-4">
          <h3 className="font-bold">Dados profissionais e fiscais</h3>
          <Field label="Tipo de cadastro" htmlFor="personType" required>
            <select
              id="personType"
              name="personType"
              defaultValue={personType}
              className="surface-card h-12 rounded-(--radius-field) px-4 text-sm"
            >
              <option value="PF">Pessoa física</option>
              <option value="PJ">Pessoa jurídica</option>
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CPF ou CNPJ" htmlFor="taxId" required>
              <Input id="taxId" name="taxId" defaultValue={taxId} required />
            </Field>
            <Field label="Razão social (PJ)" htmlFor="companyName">
              <Input id="companyName" name="companyName" defaultValue={companyName} />
            </Field>
            <Field label="Anos de experiência" htmlFor="yearsOfExperience" required>
              <Input
                id="yearsOfExperience"
                name="yearsOfExperience"
                type="number"
                min={1}
                max={70}
                defaultValue={yearsOfExperience ?? ""}
                required
              />
            </Field>
            <Field label="Bairro base" htmlFor="neighborhood" required>
              <Input id="neighborhood" name="neighborhood" defaultValue={neighborhood} required />
            </Field>
            <Field label="Raio de atendimento (km)" htmlFor="serviceRadiusKm" required>
              <Input
                id="serviceRadiusKm"
                name="serviceRadiusKm"
                type="number"
                min={1}
                max={200}
                defaultValue={serviceRadiusKm}
                required
              />
            </Field>
          </div>
          <Button type="submit" disabled={busy}>Salvar dados profissionais</Button>
        </form>
      )}

      <div>
        <h3 className="font-bold">Checklist documental</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {required.map((type) => {
            const document = latest.get(type);
            return (
              <li key={type} className="surface-muted flex items-center justify-between gap-2 rounded-[8px] p-3 text-sm">
                <span>{DOCUMENTOS.find(([value]) => value === type)?.[1] ?? type}</span>
                <Badge tone={document ? document.status === "REJEITADO" ? "danger" : "success" : "neutral"}>
                  {document ? document.status.toLowerCase() : "Pendente"}
                </Badge>
              </li>
            );
          })}
        </ul>
      </div>

      {editable && (
        <form onSubmit={addDocument} className="flex flex-col gap-4 border-t border-[var(--surface-border)] pt-5">
          <h3 className="font-bold">Adicionar documento</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="documentType" required>
              <select id="documentType" name="type" className="surface-card h-12 rounded-(--radius-field) px-4 text-sm">
                {DOCUMENTOS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Imagem" htmlFor="file" required>
              <Input
                id="file"
                name="file"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                required
                className="h-auto px-4 py-3 file:mr-4 file:rounded-(--radius-pill) file:border-0 file:bg-[var(--accent-soft)] file:px-4 file:py-2 file:text-[0.8125rem] file:font-semibold file:text-[var(--accent-text)]"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview);
                  setSelectedImage(file ?? null);
                  setSelectedImagePreview(file ? URL.createObjectURL(file) : null);
                }}
              />
            </Field>
            <div className="surface-muted flex min-h-24 items-center gap-4 rounded-[8px] p-3 sm:col-span-2">
              <div className="bg-surface flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-[var(--surface-border)]">
                {selectedImagePreview ? (
                  <Image
                    src={selectedImagePreview}
                    alt="Pré-visualização da imagem selecionada"
                    width={64}
                    height={64}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-muted text-xs font-semibold">Imagem</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {selectedImage?.name ?? "Nenhuma imagem selecionada"}
                </p>
                <p className="text-muted mt-1 text-xs leading-relaxed">
                  JPG, PNG ou WEBP até 10 MB. A imagem segue para análise interna
                  como cópia privada.
                </p>
              </div>
            </div>
          </div>
          <Button type="submit" variant="secondary" disabled={busy}>Adicionar documento</Button>
        </form>
      )}

      {editable && (
        <div className="accent-soft rounded-[8px] border p-4">
          <h3 className="font-bold">Enviar para análise</h3>
          <p className="text-secondary mt-1 text-sm">Após o envio, os dados ficam bloqueados até a decisão administrativa.</p>
          <Button
            className="mt-3"
            disabled={busy || !complete}
            onClick={() => send({ action: "SUBMIT" })}
          >
            Enviar cadastro para análise
          </Button>
        </div>
      )}
    </div>
  );
}
