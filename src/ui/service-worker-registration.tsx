"use client";

import { useEffect } from "react";

/**
 * Registra o service worker apenas em produção — em desenvolvimento ele
 * interfere no hot reload e mascara alterações.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Falha ao registrar o service worker", error);
      });
    };

    // Espera a página estabilizar para não competir com o carregamento inicial.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
