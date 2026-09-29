import { afterEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/domain/shared/errors";
import { cifrarChave, decifrarChave } from "@/server/higgsfield/credencial";

const CHAVE = "35bfake0-0000-4000-8000-000000000000:fakesecretfakesecretfakesecret";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("chave da Higgsfield no cookie", () => {
  it("cifra e decifra para o mesmo usuário", async () => {
    const token = await cifrarChave(CHAVE, "admin-1");
    expect(await decifrarChave(token, "admin-1")).toBe(CHAVE);
  });

  it("o cookie não carrega a chave em claro nem em base64", async () => {
    const token = await cifrarChave(CHAVE, "admin-1");
    expect(token).not.toContain("fakesecret");
    expect(token).not.toContain(Buffer.from(CHAVE).toString("base64url").slice(0, 20));
    // JWE compacto: cinco partes, sem payload legível.
    expect(token.split(".")).toHaveLength(5);
  });

  it("outro admin no mesmo navegador não herda a chave", async () => {
    const token = await cifrarChave(CHAVE, "admin-1");
    expect(await decifrarChave(token, "admin-2")).toBeNull();
  });

  it("adulterado, ausente ou de outro segredo vira ausência", async () => {
    const token = await cifrarChave(CHAVE, "admin-1");
    const partes = token.split(".");
    partes[3] = `${partes[3].slice(0, -2)}AA`;
    expect(await decifrarChave(partes.join("."), "admin-1")).toBeNull();
    expect(await decifrarChave(undefined, "admin-1")).toBeNull();
    expect(await decifrarChave("lixo", "admin-1")).toBeNull();

    vi.stubEnv("AUTH_SECRET", "outro-segredo-com-mais-de-32-caracteres-aqui");
    expect(await decifrarChave(token, "admin-1")).toBeNull();
  });

  it("expira em 30 dias", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
    const token = await cifrarChave(CHAVE, "admin-1");
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    expect(await decifrarChave(token, "admin-1")).toBe(CHAVE);
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    expect(await decifrarChave(token, "admin-1")).toBeNull();
  });

  it("recusa guardar chave malformada", async () => {
    await expect(cifrarChave("id:com espaço", "admin-1")).rejects.toBeInstanceOf(DomainError);
  });
});
