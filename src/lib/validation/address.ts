import { z } from "zod";

export const createAddressSchema = z.object({
  label: z.string().max(40).default("Principal"),
  street: z.string().min(3, "Informe a rua").max(160),
  number: z.string().min(1, "Informe o número").max(20),
  complement: z.string().max(80).optional(),
  neighborhood: z.string().min(2, "Informe o bairro").max(80),
  cityId: z.string().optional(),
  cityName: z.string().min(2, "Informe a cidade").max(80),
  state: z
    .string()
    .length(2, "UF deve ter 2 letras")
    .transform((s) => s.toUpperCase()),
  postalCode: z
    .string()
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => s.length === 8, "CEP deve ter 8 dígitos"),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  isDefault: z.boolean().default(false),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
