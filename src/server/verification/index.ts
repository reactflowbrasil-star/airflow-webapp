/**
 * Registro de provedores de biometria facial.
 *
 * Espelha o padrão de PSP: `FACIAL_BIOMETRIA_PROVIDER` seleciona o adapter
 * (default sandbox). Adicionar um provedor real é implementar FacialProvider
 * e registrá-lo aqui — nenhum serviço de domínio muda.
 */

import type { FacialProvider } from "./facial-provider";
import { SandboxFacialProvider } from "./sandbox-facial-provider";
import { UnicoFacialProvider } from "./unico-facial-provider";

export * from "./facial-provider";
export { SandboxFacialProvider } from "./sandbox-facial-provider";

const registry = new Map<string, FacialProvider>();

export function registerFacialProvider(provider: FacialProvider): void {
  registry.set(provider.id, provider);
}

export function getFacialProvider(id?: string): FacialProvider {
  const providerId = id ?? process.env.FACIAL_BIOMETRIA_PROVIDER ?? "sandbox";

  const existing = registry.get(providerId);
  if (existing) return existing;

  if (providerId === "sandbox") {
    const provider = new SandboxFacialProvider();
    registry.set(provider.id, provider);
    return provider;
  }

  if (providerId === "unico") {
    const provider = new UnicoFacialProvider();
    registry.set(provider.id, provider);
    return provider;
  }

  throw new Error(
    `Provedor de biometria "${providerId}" não registrado. Implemente ` +
      `FacialProvider e chame registerFacialProvider().`,
  );
}

/** Usado pelos testes para isolar o estado entre casos. */
export function resetFacialProviders(): void {
  registry.clear();
}
