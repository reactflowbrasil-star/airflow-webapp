"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button } from "@/ui";
import { SeloVerificado } from "@/ui/selo-verificado";

/**
 * Validação facial do prestador (§8) — captura da selfie com a câmera real
 * (getUserMedia), preview espelhado e envio para análise biométrica.
 *
 * O backend decide: o provedor de biometria (sandbox ou Unico) analisa a
 * selfie e, aprovada, o prestador vira VERIFICADO com o selo em destaque.
 */

type Estado =
  | "pronto"
  | "iniciando"
  | "capturando"
  | "analisando"
  | "aprovado"
  | "reprovado";

export function FacialVerification({
  jaVerificado,
  modo,
}: {
  jaVerificado: boolean;
  modo: "sandbox" | "real";
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessaoRef = useRef<string>("");
  const [estado, setEstado] = useState<Estado>(jaVerificado ? "aprovado" : "pronto");
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  const pararCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => pararCamera();
  }, [pararCamera]);

  async function iniciar() {
    setErro(null);
    setMotivo(null);
    setEstado("iniciando");
    try {
      const res = await fetch("/api/prestador/verificacao/facial/iniciar", {
        method: "POST",
      });
      const corpo = await res.json();
      if (!res.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível iniciar a validação");
        setEstado("pronto");
        return;
      }
      sessaoRef.current = corpo.sessaoId as string;
      setEstado("capturando");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setErro(
        "Não foi possível acessar a câmera. Verifique a permissão do navegador e tente novamente.",
      );
      pararCamera();
      setEstado("pronto");
    }
  }

  function capturar() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Espelha o preview para a selfie sair na orientação natural do rosto.
    ctx.translate(720, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, 720, 720);

    pararCamera();
    setEstado("analisando");
    void validar(canvas.toDataURL("image/jpeg", 0.9));
  }

  async function validar(selfie: string) {
    setErro(null);
    try {
      const res = await fetch("/api/prestador/verificacao/facial/validar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selfie }),
      });
      const corpo = await res.json();
      if (!res.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível analisar a selfie");
        setEstado("pronto");
        return;
      }
      if (corpo.aprovado === true) {
        setEstado("aprovado");
        router.refresh();
      } else {
        setMotivo(corpo?.motivo ?? "Não foi possível confirmar sua identidade");
        setEstado("reprovado");
      }
    } catch {
      setErro("Falha de conexão ao analisar a selfie");
      setEstado("pronto");
    }
  }

  if (estado === "aprovado") {
    return (
      <div className="flex flex-col items-start gap-3">
        <SeloVerificado destaque />
        <p className="text-secondary text-sm leading-relaxed">
          Sua identidade foi validada por biometria facial. O selo VERIFICADO
          aparece no seu perfil, no dashboard e na sua ficha pública — prestadores
          verificados recebem mais solicitações.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {erro && <Alert tone="danger">{erro}</Alert>}
      {motivo && (
        <div className="flex flex-col gap-2">
          <Alert tone="warning">{motivo}</Alert>
          <p className="text-muted text-xs">
            Posicione o rosto bem iluminado, sem óculos escuros, e tente novamente.
          </p>
        </div>
      )}

      {estado === "capturando" && (
        <div className="flex flex-col gap-3">
          <div className="relative aspect-square max-w-[320px] overflow-hidden rounded-(--radius-field) border border-[var(--surface-border)] bg-[var(--surface-muted)]">
            <video
              ref={videoRef}
              playsInline
              muted
              aria-label="Prévia da câmera para captura da selfie"
              className="h-full w-full -scale-x-100 object-cover"
            />
            <span className="absolute inset-x-0 bottom-2 text-center text-xs font-semibold text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
              Posicione o rosto dentro do quadro
            </span>
          </div>
          <div className="flex gap-2">
            <Button onClick={capturar}>Capturar selfie</Button>
            <Button
              variant="ghost"
              onClick={() => {
                pararCamera();
                setEstado("pronto");
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {estado === "analisando" && (
        <p className="text-secondary text-sm">
          Analisando sua selfie (liveness + verificação facial)…
        </p>
      )}

      {(estado === "pronto" || estado === "reprovado") && (
        <Button onClick={() => void iniciar()}>
          {estado === "reprovado" ? "Tentar novamente" : "Iniciar validação facial"}
        </Button>
      )}

      {modo === "sandbox" && (
        <p className="text-muted text-xs leading-relaxed">
          Modo demonstração neste ambiente: a captura pela câmera é real, mas a
          análise biométrica é simulada. Em produção, a análise é feita por
          provedor de biometria facial (liveness anti-fraude + comparação com o
          documento).
        </p>
      )}
    </div>
  );
}
