"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button } from "@/ui";

/**
 * Foto do perfil do prestador.
 *
 * O upload é um data URL gerado no cliente: a imagem passa por um canvas de
 * 512×512 (crop quadrado central) e sai como JPEG 0.85 — tipicamente 30–120
 * KB, dentro do limite de 512 KB do servidor. Sem arquivo cru no servidor,
 * sem storage externo, e o avatar mora no banco (User.avatarUrl).
 */

const TAMANHO = 512;

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

/** Crop quadrado central e redimensiona para 512×512 — JPEG 0.85. */
function redimensionarParaDataUrl(img: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = TAMANHO;
  canvas.height = TAMANHO;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");

  const lado = Math.min(img.width, img.height);
  const sx = (img.width - lado) / 2;
  const sy = (img.height - lado) / 2;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, lado, lado, 0, 0, TAMANHO, TAMANHO);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function ProviderAvatar({
  avatarUrl,
  nome,
}: {
  avatarUrl: string | null;
  nome: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const exibida = preview ?? avatarUrl;

  async function selecionarArquivo(arquivo: File | undefined) {
    setErro(null);
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      setErro("Escolha um arquivo de imagem (JPG, PNG ou WebP)");
      return;
    }
    if (arquivo.size > 8 * 1024 * 1024) {
      setErro("Imagem muito grande (máx. 8 MB antes do ajuste)");
      return;
    }
    try {
      const img = await carregarImagem(arquivo);
      setPreview(redimensionarParaDataUrl(img));
    } catch {
      setErro("Não foi possível ler a imagem. Tente outro arquivo.");
    }
  }

  async function salvar() {
    if (!preview) return;
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch("/api/prestador/perfil/foto", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatarUrl: preview }),
      });
      const corpo = await res.json();
      if (!res.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível salvar a foto");
        return;
      }
      setPreview(null);
      router.refresh();
    } catch {
      setErro("Falha de conexão ao salvar a foto");
    } finally {
      setBusy(false);
    }
  }

  async function remover() {
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch("/api/prestador/perfil/foto", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatarUrl: null }),
      });
      if (!res.ok) {
        const corpo = await res.json();
        setErro(corpo?.error?.message ?? "Não foi possível remover a foto");
        return;
      }
      setPreview(null);
      router.refresh();
    } catch {
      setErro("Falha de conexão ao remover a foto");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void selecionarArquivo(e.target.files?.[0])}
      />
      {exibida ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={exibida}
          alt={`Foto de perfil de ${nome}`}
          className="h-16 w-16 rounded-full border border-[var(--surface-border)] object-cover"
        />
      ) : (
        <span className="bg-grad grid h-16 w-16 place-items-center rounded-full text-xl font-bold text-white">
          {nome.slice(0, 1)}
        </span>
      )}
      {preview ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void salvar()} disabled={busy}>
            Salvar foto
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPreview(null)}
            disabled={busy}
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
            Alterar foto
          </Button>
          {avatarUrl && (
            <Button size="sm" variant="ghost" onClick={() => void remover()} disabled={busy}>
              Remover
            </Button>
          )}
        </div>
      )}
      {erro && (
        <div className="w-full">
          <Alert tone="danger">{erro}</Alert>
        </div>
      )}
    </div>
  );
}
