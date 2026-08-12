import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  compararSegura,
  gerarPkce,
  montarUrlAutorizacaoGoogle,
  nomeDoEmail,
  validarClaimsIdToken,
} from "@/server/auth/oauth-google";

const CLIENT_ID = "12345.apps.googleusercontent.com";
const NONCE = "nonce-abc";

const claimsValidas = {
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  nonce: NONCE,
  email: "Ana.Souza@gmail.com",
  email_verified: true,
  name: "Ana Souza",
};

describe("OAuth Google — PKCE (RFC 7636)", () => {
  it("gera verifier de 64 caracteres e challenge S256 correspondente", () => {
    const { verifier, challenge } = gerarPkce();
    expect(verifier).toHaveLength(64);
    expect(challenge).toBe(
      createHash("sha256").update(verifier).digest("base64url"),
    );
  });

  it("gera pares diferentes a cada chamada", () => {
    const a = gerarPkce();
    const b = gerarPkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });
});

describe("OAuth Google — URL de autorização", () => {
  it("monta a URL com todos os parâmetros do fluxo", () => {
    const url = montarUrlAutorizacaoGoogle({
      clientId: CLIENT_ID,
      redirectUri: "https://airflow.app/api/auth/google/callback",
      state: "estado-1",
      nonce: "nonce-1",
      codeChallenge: "challenge-1",
    });
    const params = new URL(url).searchParams;
    expect(params.get("client_id")).toBe(CLIENT_ID);
    expect(params.get("redirect_uri")).toBe(
      "https://airflow.app/api/auth/google/callback",
    );
    expect(params.get("response_type")).toBe("code");
    expect(params.get("scope")).toBe("openid email profile");
    expect(params.get("state")).toBe("estado-1");
    expect(params.get("nonce")).toBe("nonce-1");
    expect(params.get("code_challenge")).toBe("challenge-1");
    expect(params.get("code_challenge_method")).toBe("S256");
  });
});

describe("OAuth Google — validação de claims do id_token", () => {
  it("aceita claims válidas e normaliza e-mail/nome", () => {
    const info = validarClaimsIdToken(claimsValidas, {
      clientId: CLIENT_ID,
      nonce: NONCE,
    });
    expect(info).toEqual({ email: "ana.souza@gmail.com", name: "Ana Souza" });
  });

  it("rejeita emissor que não seja o Google", () => {
    expect(
      validarClaimsIdToken(
        { ...claimsValidas, iss: "https://evil.example.com" },
        { clientId: CLIENT_ID, nonce: NONCE },
      ),
    ).toBeNull();
  });

  it("rejeita audiência que não é o nosso client_id (lista ou string)", () => {
    expect(
      validarClaimsIdToken(
        { ...claimsValidas, aud: "outro-client.apps.googleusercontent.com" },
        { clientId: CLIENT_ID, nonce: NONCE },
      ),
    ).toBeNull();
    expect(
      validarClaimsIdToken(
        { ...claimsValidas, aud: [CLIENT_ID, "outro-client"] },
        { clientId: CLIENT_ID, nonce: NONCE },
      ),
    ).not.toBeNull();
    expect(
      validarClaimsIdToken(
        { ...claimsValidas, aud: ["outro-client"] },
        { clientId: CLIENT_ID, nonce: NONCE },
      ),
    ).toBeNull();
  });

  it("rejeita nonce divergente — replay de token antigo", () => {
    expect(
      validarClaimsIdToken(claimsValidas, {
        clientId: CLIENT_ID,
        nonce: "outro-nonce",
      }),
    ).toBeNull();
  });

  it("rejeita e-mail não verificado pelo Google", () => {
    expect(
      validarClaimsIdToken(
        { ...claimsValidas, email_verified: false },
        { clientId: CLIENT_ID, nonce: NONCE },
      ),
    ).toBeNull();
    expect(
      validarClaimsIdToken(
        { ...claimsValidas, email_verified: undefined },
        { clientId: CLIENT_ID, nonce: NONCE },
      ),
    ).toBeNull();
  });

  it("rejeita e-mail ausente ou vazio", () => {
    expect(
      validarClaimsIdToken(
        { ...claimsValidas, email: "" },
        { clientId: CLIENT_ID, nonce: NONCE },
      ),
    ).toBeNull();
    expect(
      validarClaimsIdToken(
        { ...claimsValidas, email: undefined },
        { clientId: CLIENT_ID, nonce: NONCE },
      ),
    ).toBeNull();
  });

  it("deriva nome do e-mail quando o Google não envia name", () => {
    const semNome = { ...claimsValidas, name: undefined };
    const info = validarClaimsIdToken(semNome, {
      clientId: CLIENT_ID,
      nonce: NONCE,
    });
    expect(info?.name).toBe("Ana Souza");
  });
});

describe("OAuth Google — auxiliares", () => {
  it("deriva nome legível do e-mail", () => {
    expect(nomeDoEmail("ana.souza@example.com")).toBe("Ana Souza");
    expect(nomeDoEmail("joao_maria@example.com")).toBe("Joao Maria");
    expect(nomeDoEmail("a@example.com")).toBe("Usuário Google");
  });

  it("compara em tempo constante: iguais sim, diferentes não", () => {
    expect(compararSegura("abc", "abc")).toBe(true);
    expect(compararSegura("abc", "abd")).toBe(false);
    expect(compararSegura("abc", "abcd")).toBe(false);
  });
});
