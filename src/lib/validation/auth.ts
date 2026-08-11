import { z } from "zod";

const senha = z
  .string()
  .min(8, "A senha deve ter ao menos 8 caracteres")
  .max(128, "Senha muito longa")
  .regex(/[a-zA-Z]/, "A senha deve conter ao menos uma letra")
  .regex(/\d/, "A senha deve conter ao menos um número");

export const registerSchema = z.object({
  name: z.string().min(2, "Informe seu nome").max(120).trim(),
  email: z.email("E-mail inválido").toLowerCase().trim(),
  phone: z
    .string()
    .regex(/^\d{10,11}$/, "Telefone deve ter DDD + número, apenas dígitos")
    .optional(),
  password: senha,
  role: z.enum(["CUSTOMER", "PROVIDER"]).default("CUSTOMER"),
  /** LGPD (§58): aceite explícito, registrado com versão do termo. */
  acceptTerms: z.literal(true, "É necessário aceitar os termos de uso"),
  marketingConsent: z.boolean().default(false),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email("E-mail inválido").toLowerCase().trim(),
  password: z.string().min(1, "Informe a senha"),
});

export type LoginInput = z.infer<typeof loginSchema>;
