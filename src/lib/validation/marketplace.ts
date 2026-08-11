import { z } from "zod";

/** Aceita "280", "280,00" ou "R$ 1.234,56" e devolve centavos inteiros. */
const valorEmCentavos = z
  .union([z.number().int().positive(), z.string()])
  .transform((raw, ctx) => {
    if (typeof raw === "number") return raw;
    const limpo = raw.replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
    const match = /^(\d{1,13})(?:[.,](\d{1,2}))?$/.exec(limpo);
    if (!match) {
      ctx.addIssue({ code: "custom", message: "Valor monetário inválido" });
      return z.NEVER;
    }
    const cents =
      Number.parseInt(match[1], 10) * 100 +
      Number.parseInt((match[2] ?? "").padEnd(2, "0") || "0", 10);
    if (cents <= 0) {
      ctx.addIssue({ code: "custom", message: "Valor deve ser maior que zero" });
      return z.NEVER;
    }
    return cents;
  });

export const createRequestSchema = z.object({
  categoryId: z.string().min(1, "Selecione o serviço"),
  addressId: z.string().min(1, "Selecione o endereço"),
  equipmentType: z.enum([
    "SPLIT",
    "INVERTER",
    "JANELA",
    "CASSETE",
    "PISO_TETO",
    "MULTI_SPLIT",
    "OUTRO",
  ]),
  quantity: z.coerce.number().int().min(1).max(50),
  btus: z.coerce.number().int().positive().optional(),
  brand: z.string().max(60).optional(),
  propertyType: z.enum(["RESIDENCIAL", "COMERCIAL"]).default("RESIDENCIAL"),
  description: z
    .string()
    .min(10, "Descreva o problema com pelo menos 10 caracteres")
    .max(2000),
  urgency: z.enum(["BAIXA", "NORMAL", "ALTA", "EMERGENCIA"]).default("NORMAL"),
  desiredDate: z.coerce.date().optional(),
  proposedPriceCents: valorEmCentavos,
  providerId: z.string().optional(),
  searchQuery: z.string().max(200).optional(),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const createProposalSchema = z.object({
  requestId: z.string().min(1),
  providerId: z.string().min(1),
  amountCents: valorEmCentavos,
  message: z.string().max(1000).optional(),
  estimatedDurationMinutes: z.coerce.number().int().positive().optional(),
});

export const checkoutSchema = z.object({
  orderId: z.string().min(1),
  method: z.enum(["PIX", "CREDIT_CARD", "DEBIT_CARD", "BOLETO"]),
  /** Token do checkout do PSP. Número de cartão e CVV nunca chegam aqui (§24). */
  cardToken: z.string().optional(),
  installments: z.coerce.number().int().min(1).max(12).optional(),
});

export const searchProvidersSchema = z.object({
  q: z.string().max(200).optional(),
  cidade: z.string().max(80).optional(),
  categoria: z.string().max(80).optional(),
  precoMax: z.coerce.number().int().positive().optional(),
  notaMin: z.coerce.number().min(0).max(5).optional(),
  verificados: z.coerce.boolean().optional(),
  emergencia: z.coerce.boolean().optional(),
  comercial: z.coerce.boolean().optional(),
  ordenar: z
    .enum(["recomendados", "avaliacao", "proximos", "preco", "experiencia", "resposta"])
    .default("recomendados"),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
});

export type SearchProvidersInput = z.infer<typeof searchProvidersSchema>;

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  texto: z.string().min(1).max(2000),
});
