"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Assina um stream SSE e dispara `router.refresh()` quando o servidor avisa
 * que algo mudou. O servidor segue a única fonte de verdade — este componente
 * só transforma o aviso em releitura; não duplica estado no cliente.
 *
 * Usado no dashboard do cliente (ordens ativas) e na página de
 * acompanhamento do pedido (jornada completa).
 */
export function OrderLiveStream({
  url,
  evento = "atualizacao",
}: {
  url: string;
  evento?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const eventSource = new EventSource(url);
    eventSource.addEventListener(evento, () => router.refresh());
    return () => eventSource.close();
  }, [url, evento, router]);

  return null;
}
