"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Badge, Button } from "@/ui";

interface DispatchAlert {
  candidateId: string;
  requestId: string;
  categoria: string;
  bairro: string;
  cidade: string;
  urgencia: "BAIXA" | "NORMAL" | "ALTA" | "EMERGENCIA";
  equipamento: string;
  quantidade: number;
  descricao: string;
  valorPropostoCents: number;
  distanciaKm: number | null;
  alertadoEm: string;
}

const URGENCIA_TOM = {
  BAIXA: "neutral",
  NORMAL: "neutral",
  ALTA: "warning",
  EMERGENCIA: "danger",
} as const;

function formatar(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function equipamentoLabel(tipo: string, quantidade: number): string {
  const labels: Record<string, string> = {
    SPLIT: "Split",
    INVERTER: "Inverter",
    JANELA: "Janela",
    CASSETE: "Cassete",
    PISO_TETO: "Piso-teto",
    MULTI_SPLIT: "Multi Split",
    OUTRO: "Outro",
  };
  return `${quantidade}× ${labels[tipo] ?? tipo}`;
}

export function ProviderDispatchAlerts() {
  const router = useRouter();
  const audioContext = useRef<AudioContext | null>(null);
  const [alerts, setAlerts] = useState<DispatchAlert[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const lastSeen = useRef<string>("");

  const playAlert = useCallback(() => {
    if (!soundEnabled) return;
    const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
    audioContext.current ??= new AudioCtor();
    const ctx = audioContext.current;
    const now = ctx.currentTime;

    [0, 0.18, 0.36].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(880, now + offset);
      osc.frequency.exponentialRampToValueAtTime(1320, now + offset + 0.08);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.15);
    });
  }, [soundEnabled]);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/prestador/alertas", { cache: "no-store" });
    const corpo = await res.json();
    if (!res.ok) {
      setErro(corpo?.error?.message ?? "Não foi possível carregar alertas");
      return;
    }
    const nextAlerts = (corpo.alerts ?? []) as DispatchAlert[];
    const assinatura = nextAlerts.map((alert) => alert.candidateId).join("|");
    if (assinatura && assinatura !== lastSeen.current) {
      playAlert();
    }
    lastSeen.current = assinatura;
    setAlerts(nextAlerts);
  }, [playAlert]);

  useEffect(() => {
    const firstRun = window.setTimeout(() => void carregar(), 0);
    const interval = window.setInterval(() => void carregar(), 8000);
    return () => {
      window.clearTimeout(firstRun);
      window.clearInterval(interval);
    };
  }, [carregar]);

  async function ativarSom() {
    const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
    audioContext.current ??= new AudioCtor();
    await audioContext.current.resume();
    setSoundEnabled(true);
  }

  async function aceitar(candidateId: string) {
    setErro(null);
    setOcupado(candidateId);
    try {
      const res = await fetch(`/api/prestador/alertas/${candidateId}/aceitar`, {
        method: "POST",
      });
      const corpo = await res.json();
      if (!res.ok) {
        setErro(corpo?.error?.message ?? "Alerta indisponível");
        await carregar();
        return;
      }
      router.refresh();
      await carregar();
    } catch {
      setErro("Falha de conexão ao aceitar o alerta");
    } finally {
      setOcupado(null);
    }
  }

  if (alerts.length === 0 && !erro) return null;

  return (
    <section className="surface-card relative overflow-hidden rounded-(--radius-card) border-[var(--accent-border)] p-5 shadow-(--shadow-float)">
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--accent),var(--accent-2),var(--accent))]" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-[var(--accent-text)]">Alerta em tempo real</p>
          <h2 className="mt-2 text-xl font-extrabold tracking-[-0.03em]">
            Pedido próximo aguardando resposta
          </h2>
          <p className="text-muted mt-1 text-sm">
            O primeiro prestador que aceitar entra na negociação. Se não fechar, a fila
            roda automaticamente.
          </p>
        </div>
        <Button size="sm" variant={soundEnabled ? "secondary" : "primary"} onClick={ativarSom}>
          {soundEnabled ? "Som ativado" : "Ativar som"}
        </Button>
      </div>

      {erro && (
        <div className="mt-4">
          <Alert tone="danger">{erro}</Alert>
        </div>
      )}

      <ul className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {alerts.map((alert) => (
          <li
            key={alert.candidateId}
            className="rounded-3xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold">{alert.categoria}</h3>
                <p className="text-muted mt-1 text-xs">
                  {alert.bairro}, {alert.cidade}
                  {alert.distanciaKm !== null ? ` · ${alert.distanciaKm} km aprox.` : ""}
                </p>
              </div>
              <Badge tone={URGENCIA_TOM[alert.urgencia]}>{alert.urgencia}</Badge>
            </div>

            <p className="num mt-3 text-2xl font-extrabold text-[var(--accent-text)]">
              {formatar(alert.valorPropostoCents)}
            </p>
            <p className="text-secondary mt-2 text-sm">
              {equipamentoLabel(alert.equipamento, alert.quantidade)}
            </p>
            <p className="text-secondary mt-2 line-clamp-2 text-sm">{alert.descricao}</p>

            <Button
              className="mt-4 w-full"
              onClick={() => aceitar(alert.candidateId)}
              disabled={ocupado === alert.candidateId}
            >
              Aceitar para negociar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
