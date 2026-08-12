"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { LiveDot } from "@/ui";

/**
 * Atualização automática do painel — o "tempo real" honesto.
 *
 * A cada 30s um `router.refresh()` refaz a leitura server-side; o painel é um
 * server component, então não há estado duplicado para reconciliar no cliente
 * e o servidor segue a única fonte de verdade. Intervalo curto demais só
 * bateria no banco à toa; 30s mostra o movimento da operação sem custo.
 */
export function AdminLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--ok-text)]">
      <LiveDot />
      atualização automática
    </span>
  );
}
