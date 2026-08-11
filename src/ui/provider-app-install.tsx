"use client";

import { useEffect, useState } from "react";

import { Alert, Button, ButtonLink } from "@/ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function ProviderAppInstall({
  compacto = false,
}: {
  compacto?: boolean;
}) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() =>
    typeof window === "undefined" ? false : isStandalone(),
  );
  const [showHelp, setShowHelp] = useState(false);
  const [ios] = useState(() => (typeof window === "undefined" ? false : isIos()));

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }

    function onInstalled() {
      setInstalled(true);
      setPromptEvent(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function instalar() {
    if (!promptEvent) {
      setShowHelp(true);
      return;
    }

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setPromptEvent(null);
  }

  if (installed) {
    return (
      <Alert tone="success">
        App do prestador instalado. Abra pelo ícone AirFlow Pro para receber pedidos
        direto no painel.
      </Alert>
    );
  }

  return (
    <div className={compacto ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-3"}>
      <Button onClick={instalar} size={compacto ? "sm" : "md"}>
        Baixar app do prestador
      </Button>
      {!compacto && (
        <ButtonLink href="/entrar" variant="secondary">
          Já sou prestador
        </ButtonLink>
      )}

      {showHelp && (
        <Alert tone="brand">
          {ios
            ? "No iPhone, toque em Compartilhar e depois em “Adicionar à Tela de Início”."
            : "Se o botão de instalação não aparecer, abra o menu do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”."}
        </Alert>
      )}
    </div>
  );
}

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}
