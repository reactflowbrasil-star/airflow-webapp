"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert, Badge, Button, Field, Input } from "@/ui";

const DOCUMENTOS = [
  ["RG", "RG ou documento de identidade"],
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
    const saved = await send({
      action: "ADD_DOCUMENT",
      type: data.get("type"),
      fileUrl: data.get("fileUrl"),
      fileName: data.get("fileName"),
      mimeType: data.get("mimeType"),
      sizeBytes: Number(data.get("sizeMegabytes")) * 1024 * 1024,
    });
    if (saved) {
      form.reset();
      setSuccess("Documento adicionado ao histórico.");
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
            <Field label="Nome do arquivo" htmlFor="fileName" required>
              <Input id="fileName" name="fileName" placeholder="documento.pdf" required />
            </Field>
            <Field label="Link HTTPS privado" htmlFor="fileUrl" required hint="Use um link privado do seu armazenamento. Não compartilhe em páginas públicas.">
              <Input id="fileUrl" name="fileUrl" type="url" placeholder="https://..." required />
            </Field>
            <Field label="Formato" htmlFor="mimeType" required>
              <select id="mimeType" name="mimeType" className="surface-card h-12 rounded-(--radius-field) px-4 text-sm">
                <option value="application/pdf">PDF</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/png">PNG</option>
              </select>
            </Field>
            <Field label="Tamanho aproximado (MB)" htmlFor="sizeMegabytes" required>
              <Input id="sizeMegabytes" name="sizeMegabytes" type="number" min="0.01" max="10" step="0.01" required />
            </Field>
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
