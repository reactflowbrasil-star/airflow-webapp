/**
 * Seed de desenvolvimento.
 *
 * Cria o catálogo base (categorias, cidades), o plano de contas do ledger,
 * a regra de comissão global e contas de demonstração dos três papéis.
 *
 * Idempotente: pode rodar várias vezes sem duplicar registros.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { enviarMensagem } from "../src/server/services/message-service";
import { createProposal } from "../src/server/services/proposal-service";
import { createServiceRequest } from "../src/server/services/request-service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CATEGORIES = [
  {
    slug: "limpeza-ar-condicionado",
    name: "Limpeza e higienização",
    description:
      "Limpeza completa de filtros, serpentina e turbina, com higienização antibactérias.",
    basePriceCents: 15000,
    intentKeywords: [
      "limpeza",
      "higienização",
      "cheiro ruim",
      "mau cheiro",
      "sujo",
      "fungo",
      "mofo",
      "alergia",
      "pingando",
      "vazando água",
    ],
  },
  {
    slug: "instalacao-ar-condicionado",
    name: "Instalação",
    description: "Instalação completa de aparelhos split, inverter, janela e multi split.",
    basePriceCents: 45000,
    intentKeywords: ["instalar", "instalação", "novo aparelho", "comprei", "colocar"],
  },
  {
    slug: "manutencao-preventiva",
    name: "Manutenção preventiva",
    description: "Revisão periódica para evitar falhas e manter a eficiência energética.",
    basePriceCents: 20000,
    intentKeywords: ["preventiva", "revisão", "manutenção periódica", "checagem"],
  },
  {
    slug: "manutencao-corretiva",
    name: "Manutenção corretiva",
    description: "Diagnóstico e reparo de falhas no funcionamento do equipamento.",
    basePriceCents: 25000,
    intentKeywords: [
      "não gela",
      "nao gela",
      "não liga",
      "parou",
      "quebrado",
      "defeito",
      "barulho",
      "fazendo barulho",
      "desliga sozinho",
      "erro",
    ],
  },
  {
    slug: "carga-de-gas",
    name: "Carga de gás",
    description: "Recarga de fluido refrigerante com detecção prévia de vazamentos.",
    basePriceCents: 28000,
    intentKeywords: ["gás", "gas", "recarga", "fluido", "refrigerante", "não gela direito"],
  },
  {
    slug: "desinstalacao",
    name: "Desinstalação",
    description: "Remoção segura do aparelho, preservando o equipamento e a parede.",
    basePriceCents: 18000,
    intentKeywords: ["desinstalar", "remover", "retirar", "mudança", "tirar"],
  },
  {
    slug: "reinstalacao",
    name: "Reinstalação",
    description: "Desinstalação e reinstalação do aparelho em novo local.",
    basePriceCents: 55000,
    intentKeywords: ["reinstalar", "mudar de lugar", "trocar de parede", "mudança"],
  },
  {
    slug: "diagnostico",
    name: "Diagnóstico técnico",
    description: "Avaliação técnica para identificar a origem do problema.",
    basePriceCents: 12000,
    intentKeywords: ["diagnóstico", "avaliar", "orçamento", "não sei o problema"],
  },
  {
    slug: "troca-de-componentes",
    name: "Troca de componentes",
    description: "Substituição de capacitor, placa, compressor, sensores e demais peças.",
    basePriceCents: 30000,
    intentKeywords: ["placa", "capacitor", "compressor", "peça", "trocar peça", "sensor"],
  },
  {
    slug: "atendimento-emergencial",
    name: "Atendimento emergencial",
    description: "Atendimento prioritário no mesmo dia para casos urgentes.",
    basePriceCents: 35000,
    intentKeywords: ["urgente", "emergência", "hoje", "agora", "socorro"],
  },
];

const CITIES = [
  { name: "São Paulo", state: "SP", slug: "sao-paulo-sp", latitude: -23.5505, longitude: -46.6333 },
  { name: "Rio de Janeiro", state: "RJ", slug: "rio-de-janeiro-rj", latitude: -22.9068, longitude: -43.1729 },
  { name: "Belo Horizonte", state: "MG", slug: "belo-horizonte-mg", latitude: -19.9167, longitude: -43.9345 },
  { name: "Brasília", state: "DF", slug: "brasilia-df", latitude: -15.7939, longitude: -47.8828 },
  { name: "Curitiba", state: "PR", slug: "curitiba-pr", latitude: -25.4284, longitude: -49.2733 },
  { name: "Fortaleza", state: "CE", slug: "fortaleza-ce", latitude: -3.7319, longitude: -38.5267 },
  { name: "Recife", state: "PE", slug: "recife-pe", latitude: -8.0476, longitude: -34.877 },
  { name: "Salvador", state: "BA", slug: "salvador-ba", latitude: -12.9777, longitude: -38.5016 },
];

/** Plano de contas (§21). Contas de prestador são criadas sob demanda. */
const LEDGER_ACCOUNTS = [
  { code: "PLATFORM_CASH", type: "PLATFORM_CASH", name: "Caixa da plataforma no PSP" },
  { code: "PLATFORM_REVENUE", type: "PLATFORM_REVENUE", name: "Receita de comissão" },
  { code: "CUSTOMER_ESCROW", type: "CUSTOMER_ESCROW", name: "Valores retidos de clientes" },
  { code: "GATEWAY_FEES", type: "GATEWAY_FEES", name: "Taxas do gateway" },
  { code: "REFUNDS_PAYABLE", type: "REFUNDS_PAYABLE", name: "Estornos a executar" },
  { code: "CHARGEBACK_LOSSES", type: "CHARGEBACK_LOSSES", name: "Perdas por chargeback" },
] as const;

async function main() {
  console.log("Semeando catálogo...");

  for (const [index, category] of CATEGORIES.entries()) {
    await prisma.serviceCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        basePriceCents: category.basePriceCents,
        intentKeywords: category.intentKeywords,
        position: index,
      },
      create: { ...category, position: index },
    });
  }
  console.log(`  ${CATEGORIES.length} categorias`);

  for (const city of CITIES) {
    await prisma.city.upsert({
      where: { slug: city.slug },
      update: {},
      create: city,
    });
  }
  console.log(`  ${CITIES.length} cidades`);

  for (const account of LEDGER_ACCOUNTS) {
    await prisma.ledgerAccount.upsert({
      where: { code: account.code },
      update: {},
      create: account,
    });
  }
  console.log(`  ${LEDGER_ACCOUNTS.length} contas do ledger`);

  // Regra de comissão global — 15%, versão 1 (§20)
  const existingGlobal = await prisma.commissionRule.findFirst({
    where: { scope: "GLOBAL", active: true },
  });
  if (!existingGlobal) {
    await prisma.commissionRule.create({
      data: {
        name: "Comissão padrão da plataforma",
        scope: "GLOBAL",
        percentBps: 1500,
        version: 1,
        active: true,
      },
    });
    console.log("  regra de comissão global 15%");
  }

  // Contas de demonstração
  const passwordHash = await bcrypt.hash("Demo1234", 12);
  const saoPaulo = await prisma.city.findUniqueOrThrow({ where: { slug: "sao-paulo-sp" } });

  const admin = await prisma.user.upsert({
    where: { email: "admin@airflow.local" },
    update: {},
    create: {
      email: "admin@airflow.local",
      name: "Administrador",
      passwordHash,
      role: "ADMIN",
      termsAcceptedAt: new Date(),
      termsVersion: "2026-08-11",
    },
  });

  const clienteUser = await prisma.user.upsert({
    where: { email: "cliente@airflow.local" },
    update: {},
    create: {
      email: "cliente@airflow.local",
      name: "Marina Duarte",
      passwordHash,
      role: "CUSTOMER",
      termsAcceptedAt: new Date(),
      termsVersion: "2026-08-11",
      customerProfile: { create: {} },
    },
  });

  const tecnicoUser = await prisma.user.upsert({
    where: { email: "tecnico@airflow.local" },
    update: {},
    create: {
      email: "tecnico@airflow.local",
      name: "Rafael Nogueira",
      passwordHash,
      role: "PROVIDER",
      termsAcceptedAt: new Date(),
      termsVersion: "2026-08-11",
      providerProfile: {
        create: {
          slug: "rafael-nogueira-climatizacao",
          displayName: "Rafael Nogueira Climatização",
          bio: "Técnico em refrigeração com 12 anos de experiência em split e inverter. Atendimento residencial e comercial na zona sul de São Paulo.",
          status: "APROVADO",
          verified: true,
          onboardingStep: 11,
          yearsOfExperience: 12,
          acceptsCommercial: true,
          acceptsEmergency: true,
          baseLatitude: -23.5905,
          baseLongitude: -46.6533,
          serviceRadiusKm: 20,
          cityId: saoPaulo.id,
          neighborhood: "Vila Mariana",
          approvedAt: new Date(),
          balance: { create: {} },
        },
      },
    },
  });

  const providerProfile = await prisma.providerProfile.findUniqueOrThrow({
    where: { userId: tecnicoUser.id },
  });

  // Conta de ledger individual do prestador
  await prisma.ledgerAccount.upsert({
    where: { code: `PROVIDER_PAYABLE:${providerProfile.id}` },
    update: {},
    create: {
      code: `PROVIDER_PAYABLE:${providerProfile.id}`,
      type: "PROVIDER_PAYABLE",
      name: `A pagar — ${providerProfile.displayName}`,
      ownerProviderId: providerProfile.id,
    },
  });

  // Serviços oferecidos pelo técnico demo
  const limpeza = await prisma.serviceCategory.findUniqueOrThrow({
    where: { slug: "limpeza-ar-condicionado" },
  });
  const instalacao = await prisma.serviceCategory.findUniqueOrThrow({
    where: { slug: "instalacao-ar-condicionado" },
  });
  for (const [category, price] of [
    [limpeza, 14000],
    [instalacao, 42000],
  ] as const) {
    await prisma.providerService.upsert({
      where: {
        providerId_categoryId: { providerId: providerProfile.id, categoryId: category.id },
      },
      update: {},
      create: {
        providerId: providerProfile.id,
        categoryId: category.id,
        fromPriceCents: price,
      },
    });
  }

  await negociacaoDemo(clienteUser.id, providerProfile.id, limpeza.id, saoPaulo.id);

  console.log("  contas demo:");
  console.log(`    admin    ${admin.email}    / Demo1234`);
  console.log(`    cliente  ${clienteUser.email}  / Demo1234`);
  console.log(`    técnico  ${tecnicoUser.email}  / Demo1234`);
  console.log("Seed concluído.");
}

/**
 * Negociação de demonstração: uma solicitação com rodada de proposta e
 * contraproposta, mais duas mensagens de texto.
 *
 * Passa pelos serviços reais em vez de inserir linhas à mão — assim o seed
 * exercita a criação automática da conversa e a guarda de contato, e o que
 * aparece na tela de Mensagens é exatamente o que o produto produz.
 */
async function negociacaoDemo(
  clienteUserId: string,
  providerId: string,
  categoryId: string,
  cityId: string,
) {
  const customer = await prisma.customerProfile.findUniqueOrThrow({
    where: { userId: clienteUserId },
  });

  // Idempotência: o seed roda várias vezes: se a conversa já existe, sai.
  const jaExiste = await prisma.conversation.findFirst({
    where: { customerId: customer.id, providerId },
  });
  if (jaExiste) {
    console.log("  negociação demo já existe");
    return;
  }

  const address = await prisma.address.upsert({
    where: { id: `demo-address-${customer.id}` },
    update: {},
    create: {
      id: `demo-address-${customer.id}`,
      userId: clienteUserId,
      street: "Rua Vergueiro",
      number: "1000",
      neighborhood: "Vila Mariana",
      cityId,
      cityName: "São Paulo",
      state: "SP",
      postalCode: "04101000",
      latitude: -23.5905,
      longitude: -46.6333,
      isDefault: true,
    },
  });

  const request = await createServiceRequest(
    {
      customerId: customer.id,
      categoryId,
      addressId: address.id,
      equipmentType: "SPLIT",
      quantity: 2,
      description:
        "Dois splits de 12.000 BTUs, sala e quarto. Um deles não está gelando e faz barulho ao ligar.",
      proposedPriceCents: 26000,
      urgency: "NORMAL",
    },
    "seed",
  );

  await createProposal(
    {
      requestId: request.id,
      providerId,
      author: "CLIENTE",
      amountCents: 26000,
      message: "Consigo pagar esse valor pelos dois aparelhos?",
    },
    "seed",
  );
  await createProposal(
    {
      requestId: request.id,
      providerId,
      author: "PRESTADOR",
      amountCents: 28000,
      message: "Faço os dois com higienização completa por este valor.",
    },
    "seed",
  );

  const conversa = await prisma.conversation.findFirstOrThrow({
    where: { requestId: request.id },
  });
  const tecnico = await prisma.providerProfile.findUniqueOrThrow({
    where: { id: providerId },
    select: { userId: true },
  });

  await enviarMensagem({
    conversationId: conversa.id,
    senderUserId: clienteUserId,
    texto: "Boa tarde! Tem horário na quinta à tarde?",
    correlationId: "seed",
  });
  await enviarMensagem({
    conversationId: conversa.id,
    senderUserId: tecnico.userId,
    texto: "Boa tarde, Marina! Quinta às 14h está livre, fecho assim.",
    correlationId: "seed",
  });

  console.log("  negociação demo com conversa criada");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
