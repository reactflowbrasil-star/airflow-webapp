/**
 * Registro de provedores de pagamento.
 *
 * Adicionar um PSP real é implementar PaymentProvider e registrar aqui —
 * nenhum serviço de domínio precisa mudar.
 */

import type { PaymentProvider } from "./provider";
import { SandboxPaymentProvider } from "./sandbox-provider";

export * from "./provider";
export { SandboxPaymentProvider } from "./sandbox-provider";

const registry = new Map<string, PaymentProvider>();

export function registerPaymentProvider(provider: PaymentProvider): void {
  registry.set(provider.id, provider);
}

export function getPaymentProvider(id?: string): PaymentProvider {
  const providerId = id ?? process.env.PAYMENT_PROVIDER ?? "sandbox";

  const existing = registry.get(providerId);
  if (existing) return existing;

  if (providerId === "sandbox") {
    const provider = new SandboxPaymentProvider(
      process.env.SANDBOX_WEBHOOK_SECRET ?? "whsec_dev_sandbox_0123456789",
    );
    registry.set(provider.id, provider);
    return provider;
  }

  throw new Error(
    `Provedor de pagamento "${providerId}" não registrado. ` +
      `Implemente PaymentProvider e chame registerPaymentProvider().`,
  );
}

/** Usado pelos testes para isolar o estado entre casos. */
export function resetPaymentProviders(): void {
  registry.clear();
}
