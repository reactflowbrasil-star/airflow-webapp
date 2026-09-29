import { afterEach, describe, expect, it, vi } from "vitest";

import { origemPublica } from "@/lib/origem-publica";
import { ForbiddenError } from "@/server/auth/rbac";
import { exigirMesmaOrigem } from "@/server/higgsfield/http";

/** Só os cabeçalhos importam para a checagem; um Request real filtraria Host. */
function requisicao(cabecalhos: Record<string, string>): Request {
  return { headers: new Headers(cabecalhos) } as unknown as Request;
}

function noCodespace(nome = "estudio-xyz") {
  vi.stubEnv("CODESPACE_NAME", nome);
  vi.stubEnv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("origemPublica", () => {
  it("fora do Codespaces não há origem extra", () => {
    expect(origemPublica({})).toBeNull();
  });

  it("no Codespaces é a origem exata do codespace, na porta 3000 por padrão", () => {
    expect(
      origemPublica({ CODESPACE_NAME: "estudio-xyz", GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev" }),
    ).toBe("https://estudio-xyz-3000.app.github.dev");
  });

  it("acompanha a PORT do servidor", () => {
    expect(
      origemPublica({
        CODESPACE_NAME: "estudio-xyz",
        GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
        PORT: "3100",
      }),
    ).toBe("https://estudio-xyz-3100.app.github.dev");
  });

  it("ORIGEM_PUBLICA gravada no .env vale mesmo sem as variáveis do Codespaces", () => {
    expect(origemPublica({ ORIGEM_PUBLICA: "https://estudio-xyz-3000.app.github.dev/" })).toBe(
      "https://estudio-xyz-3000.app.github.dev",
    );
  });

  it("recusa origem que não é https ou não é URL", () => {
    expect(origemPublica({ ORIGEM_PUBLICA: "http://estudio-xyz-3000.app.github.dev" })).toBeNull();
    expect(origemPublica({ ORIGEM_PUBLICA: "*" })).toBeNull();
  });
});

describe("exigirMesmaOrigem", () => {
  it("aceita requisição sem Origin e da mesma origem", () => {
    expect(() => exigirMesmaOrigem(requisicao({ host: "localhost:3000" }))).not.toThrow();
    expect(() =>
      exigirMesmaOrigem(requisicao({ origin: "https://hatclaw.run.place", "x-forwarded-host": "hatclaw.run.place" })),
    ).not.toThrow();
  });

  it("recusa outra origem e a origem opaca", () => {
    expect(() =>
      exigirMesmaOrigem(requisicao({ origin: "https://ataque.exemplo", host: "hatclaw.run.place" })),
    ).toThrow(ForbiddenError);
    expect(() => exigirMesmaOrigem(requisicao({ origin: "null", host: "localhost:3000" }))).toThrow(ForbiddenError);
  });

  it("no Codespaces aceita a origem pública com o Host reescrito para localhost", () => {
    noCodespace();
    expect(() =>
      exigirMesmaOrigem(
        requisicao({
          origin: "https://estudio-xyz-3000.app.github.dev",
          host: "localhost:3000",
          "x-forwarded-host": "localhost:3000",
        }),
      ),
    ).not.toThrow();
  });

  it("no Codespaces recusa o codespace de outra pessoa e a mesma origem sem https", () => {
    noCodespace();
    const host = { host: "localhost:3000", "x-forwarded-host": "localhost:3000" };
    expect(() =>
      exigirMesmaOrigem(requisicao({ origin: "https://outro-3000.app.github.dev", ...host })),
    ).toThrow(ForbiddenError);
    expect(() =>
      exigirMesmaOrigem(requisicao({ origin: "http://estudio-xyz-3000.app.github.dev", ...host })),
    ).toThrow(ForbiddenError);
  });

  it("fora do Codespaces a origem de um codespace é só mais uma origem estranha", () => {
    expect(() =>
      exigirMesmaOrigem(
        requisicao({ origin: "https://estudio-xyz-3000.app.github.dev", host: "localhost:3000" }),
      ),
    ).toThrow(ForbiddenError);
  });
});
