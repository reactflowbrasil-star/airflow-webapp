/**
 * Apoio aos testes de integração.
 *
 * Trabalham contra PostgreSQL real — só assim o teste prova o que interessa:
 * transações, unique constraints e locks de verdade.
 */

import bcrypt from "bcryptjs";

import { prisma } from "@/server/db/prisma";
import { getPaymentProvider, resetPaymentProviders } from "@/server/payments";
import type { SandboxPaymentProvider } from "@/server/payments";

/** Ordem inversa às FKs. TRUNCATE ... CASCADE resolve o resto. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      ledger_entries, ledger_transactions, ledger_accounts,
      payment_events, payment_attempts, payments,
      commissions, commission_snapshots, commission_rules,
      payouts, refunds, chargebacks, provider_balances, reconciliation_runs,
      dispute_evidences, disputes, reviews, favorites,
      appointments, marketplace_orders, proposals,
      messages, conversations, notifications,
      request_attachments, service_requests,
      provider_services, portfolio_items, provider_availability,
      provider_documents, provider_verifications, provider_profiles,
      customer_profiles, addresses, users, service_categories, cities,
      audit_logs, analytics_events, idempotency_keys
    RESTART IDENTITY CASCADE
  `);
  resetPaymentProviders();
}

export function sandbox(): SandboxPaymentProvider {
  return getPaymentProvider("sandbox") as SandboxPaymentProvider;
}

export interface Cenario {
  customerProfileId: string;
  customerUserId: string;
  providerProfileId: string;
  providerUserId: string;
  categoryId: string;
  addressId: string;
  cityId: string;
}

/**
 * Monta o cenário mínimo do §69: cliente com endereço, técnico aprovado,
 * categoria de serviço, cidade e a regra de comissão global de 15%.
 */
export async function criarCenarioBase(
  options: { commissionBps?: number } = {},
): Promise<Cenario> {
  const passwordHash = await bcrypt.hash("Demo1234", 4); // custo baixo: é teste

  const city = await prisma.city.create({
    data: {
      name: "São Paulo",
      state: "SP",
      slug: "sao-paulo-sp",
      latitude: -23.5505,
      longitude: -46.6333,
    },
  });

  const category = await prisma.serviceCategory.create({
    data: {
      slug: "limpeza-ar-condicionado",
      name: "Limpeza e higienização",
      basePriceCents: 15000,
      intentKeywords: ["limpeza", "não gela"],
    },
  });

  const customer = await prisma.user.create({
    data: {
      email: "cliente@teste.local",
      name: "Marina Duarte",
      passwordHash,
      role: "CUSTOMER",
      customerProfile: { create: {} },
      addresses: {
        create: {
          street: "Rua Vergueiro",
          number: "1000",
          neighborhood: "Vila Mariana",
          cityId: city.id,
          cityName: "São Paulo",
          state: "SP",
          postalCode: "04101000",
          latitude: -23.5905,
          longitude: -46.6333,
          isDefault: true,
        },
      },
    },
    include: { customerProfile: true, addresses: true },
  });

  const provider = await prisma.user.create({
    data: {
      email: "tecnico@teste.local",
      name: "Rafael Nogueira",
      passwordHash,
      role: "PROVIDER",
      providerProfile: {
        create: {
          slug: "rafael-nogueira",
          displayName: "Rafael Nogueira Climatização",
          status: "APROVADO",
          verified: true,
          onboardingStep: 11,
          cityId: city.id,
          neighborhood: "Vila Mariana",
          baseLatitude: -23.5905,
          baseLongitude: -46.6533,
          approvedAt: new Date(),
          balance: { create: {} },
        },
      },
    },
    include: { providerProfile: true },
  });

  await prisma.commissionRule.create({
    data: {
      name: "Comissão padrão da plataforma",
      scope: "GLOBAL",
      percentBps: options.commissionBps ?? 1500,
      version: 1,
      active: true,
    },
  });

  return {
    customerProfileId: customer.customerProfile!.id,
    customerUserId: customer.id,
    providerProfileId: provider.providerProfile!.id,
    providerUserId: provider.id,
    categoryId: category.id,
    addressId: customer.addresses[0].id,
    cityId: city.id,
  };
}

/** Entrega o webhook do sandbox como o PSP entregaria, com assinatura real. */
export function webhookHeaders(signature: string): Headers {
  return new Headers({
    "content-type": "application/json",
    "x-sandbox-signature": signature,
  });
}
