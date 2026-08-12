"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button } from "@/ui";

/**
 * Registro fotográfico do serviço (§35) — o prestador envia fotos (antes e
 * depois, quando aplicável) enquanto o serviço está em andamento.
 *
 * O upload é um data URL gerado no cliente: canvas com máximo de 1280px e
 * JPEG 0.8, tipicamente 150–400 KB, dentro do limite de 1 MB do servidor.
 * A foto entra no fio da conversa como mensagem IMAGE e aparece para o
 * cliente na página de acompanhamento.
 */

const MAX_LADO = 1280;

function carregarImagem(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Arquivo não é uma imagem"));
    };
    img.src = url;
  });
}

function redimensionarParaDataUrl(img: HTMLImageElement): string {
  const escala = Math.min(1, MAX_LADO / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function ServicePhotos({ orderId }: { orderId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rotulo, setRotulo] = useState("Antes");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function selecionarArquivo(arquivo: File | undefined) {
    setErro(null);
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      setErro("Escolha um arquivo de imagem (JPG, PNG ou WebP)");
      return;
    }
    if (arquivo.size > 10 * 1024 * 1024) {
      setErro("Imagem muito grande (máx. 10 MB antes do ajuste)");
      return;
    }
    try {
      const img = await carregarImagem(arquivo);
      setPreview(redimensionarParaDataUrl(img));
    } catch {
      setErro("Não foi possível ler a imagem. Tente outro arquivo.");
    }
  }

  async function enviar() {
    if (!preview) return;
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch(`/api/prestador/servicos/${orderId}/fotos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rotulo, dataUrl: preview }),
      });
      const corpo = await res.json();
      if (!res.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível salvar a foto");
        return;
      }
      setPreview(null);
      setRotulo("Antes");
      router.refresh();
    } catch {
      setErro("Falha de conexão ao salvar a foto");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-[var(--surface-border)] pt-4">
      <p className="eyebrow">Registro fotográfico</p>
      <p className="text-muted -mt-1 text-xs">
        Envie fotos do serviço executado — antes e depois, quando aplicável. O
        cliente vê na página de acompanhamento (até 6 fotos).
      </p>
      {erro && <Alert tone="danger">{erro}</Alert>}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void selecionarArquivo(e.target.files?.[0])}
      />

      {preview ? (
        <div className="flex flex-wrap items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Prévia da foto do serviço"
            className="h-24 w-24 rounded-(--radius-field) border border-[var(--surface-border)] object-cover"
          />
          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-secondary text-sm" htmlFor={`rotulo-${orderId}`}>
              Momento da foto
            </label>
            <select
              id={`rotulo-${orderId}`}
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
              className="surface-card h-10 rounded-(--radius-field) px-3 text-sm"
            >
              <option value="Antes">Antes</option>
              <option value="Depois">Depois</option>
              <option value="Outros">Outros</option>
            </select>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void enviar()} disabled={busy}>
                {busy ? "Enviando..." : "Enviar foto"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)} disabled={busy}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
          Adicionar foto
        </Button>
      )}
    </div>
  );
}
