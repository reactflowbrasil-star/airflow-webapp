import { z } from "zod";

const senha = z
  .string()
  .min(8, "A senha deve ter ao menos 8 caracteres")
  .max(128, "Senha muito longa")
  .regex(/[a-zA-Z]/, "A senha deve conter ao menos uma letra")
  .regex(/\d/, "A senha deve conter ao menos um número");

export const registerSchema = z.object({
  name: z.string().min(2, "Informe seu nome").max(120).trim(),
  // Trim ANTES de validar: e-mail colado do app de contatos costuma vir com
  // espaço no fim, e `z.email` sobre a string crua recusava algo que o
  // usuário digitou corretamente.
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  /**
   * Obrigatório: é por ele que o código de verificação chega. A validação de
   * formato fica no domínio (`normalizarTelefone`), que aceita as várias
   * formas de digitar e devolve E.164 — repetir a regra aqui criaria duas
   * definições de "telefone válido" para divergirem depois.
   */
  phone: z.string().min(10, "Informe seu celular com DDD").max(20),
  password: senha,
  role: z.enum(["CUSTOMER", "PROVIDER"]).default("CUSTOMER"),
  /** LGPD (§58): aceite explícito, registrado com versão do termo. */
  acceptTerms: z.literal(true, "É necessário aceitar os termos de uso"),
  marketingConsent: z.boolean().default(false),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const solicitarCodigoSchema = z.object({
  telefone: z.string().min(10, "Informe seu celular com DDD").max(20),
});

export const confirmarCodigoSchema = z.object({
  codigo: z.string().min(4).max(10),
});
