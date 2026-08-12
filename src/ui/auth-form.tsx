"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert, Button, Field, Input } from "@/ui";

interface FieldErrors {
  [campo: string]: string;
}

/** Extrai mensagens por campo do formato de erro do Zod devolvido pela API. */
function parseIssues(details: unknown): FieldErrors {
  if (!Array.isArray(details)) return {};
  const errors: FieldErrors = {};
  for (const issue of details) {
    if (
      typeof issue === "object" &&
      issue !== null &&
      "path" in issue &&
      "message" in issue
    ) {
      const path = (issue as { path: unknown[] }).path;
      const campo = String(path[0] ?? "");
      if (campo && !errors[campo]) {
        errors[campo] = String((issue as { message: unknown }).message);
      }
    }
  }
  return errors;
}

export function LoginForm({
  redirecionar,
  googleHabilitado = false,
  erroOauth,
}: {
  redirecionar?: string;
  googleHabilitado?: boolean;
  /** Mensagem de falha vinda do callback do Google (?erro=…). */
  erroOauth?: string;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setEnviando(true);

    const form = new FormData(event.currentTarget);
    try {
      const resposta = await fetch("/api/auth/entrar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const corpo = await resposta.json();

      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível entrar");
        return;
      }

      const destino =
        redirecionar ??
        (corpo.user.role === "PROVIDER"
          ? "/pro"
          : corpo.user.role === "ADMIN"
            ? "/admin"
            : "/app");
      router.push(destino);
      router.refresh();
    } catch {
      setErro("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {erroOauth && <Alert tone="danger">{erroOauth}</Alert>}

      {googleHabilitado && (
        <div className="flex flex-col gap-4">
          <GoogleAuthButton rotulo="Entrar com Google" redirecionar={redirecionar} />
          <DivisorOAuth />
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {erro && <Alert tone="danger">{erro}</Alert>}

      <Field label="E-mail" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@exemplo.com"
        />
      </Field>

      <Field label="Senha" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Button type="submit" size="lg" fullWidth disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </Button>

      <p className="text-muted text-center text-xs leading-relaxed">
        Ao entrar você concorda com os{" "}
        <Link href="/termos" className="text-[var(--accent-text)] hover:underline">
          termos de uso
        </Link>
        .
      </p>
    </form>
    </>
  );
}

export function RegisterForm({
  papelInicial,
  googleHabilitado = false,
}: {
  papelInicial?: "CUSTOMER" | "PROVIDER";
  googleHabilitado?: boolean;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<FieldErrors>({});
  const [enviando, setEnviando] = useState(false);
  const [papel, setPapel] = useState<"CUSTOMER" | "PROVIDER">(papelInicial ?? "CUSTOMER");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setErros({});
    setEnviando(true);

    const form = new FormData(event.currentTarget);
    try {
      const resposta = await fetch("/api/auth/registrar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          password: form.get("password"),
          role: papel,
          acceptTerms: form.get("acceptTerms") === "on",
          marketingConsent: form.get("marketingConsent") === "on",
        }),
      });
      const corpo = await resposta.json();

      if (!resposta.ok) {
        setErros(parseIssues(corpo?.error?.details));
        setErro(corpo?.error?.message ?? "Não foi possível criar a conta");
        return;
      }

      // A conta nasce pendente: o próximo passo é confirmar o código.
      router.push("/verificar");
      router.refresh();
    } catch {
      setErro("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {erro && <Alert tone="danger">{erro}</Alert>}

      {googleHabilitado && papel === "CUSTOMER" ? (
        <div className="flex flex-col gap-4">
          <GoogleAuthButton rotulo="Criar conta com Google" />
          <DivisorOAuth />
        </div>
      ) : googleHabilitado ? (
        <p className="surface-muted rounded-[14px] px-4 py-3 text-xs leading-relaxed text-secondary">
          O cadastro de técnico usa celular e senha — o WhatsApp é o canal de
          entrega das solicitações. Contas Google são de cliente.
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Você quer</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["CUSTOMER", "Contratar serviço"],
              ["PROVIDER", "Oferecer serviço"],
            ] as const
          ).map(([valor, rotulo]) => (
            <label
              key={valor}
              className={`cursor-pointer rounded-[16px] border p-3.5 text-center text-sm font-semibold transition-all duration-250 ${
                papel === valor
                  ? "accent-soft border-[var(--accent)] text-[var(--accent-text)]"
                  : "surface-card hover:border-[var(--accent-border)]"
              }`}
            >
              <input
                type="radio"
                name="role"
                value={valor}
                checked={papel === valor}
                onChange={() => setPapel(valor)}
                className="sr-only"
              />
              {rotulo}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Nome completo" htmlFor="name" required error={erros.name}>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          aria-invalid={Boolean(erros.name)}
        />
      </Field>

      <Field label="E-mail" htmlFor="email" required error={erros.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(erros.email)}
        />
      </Field>

      <Field
        label="Celular com WhatsApp"
        htmlFor="phone"
        required
        error={erros.phone}
        hint="Enviamos um código por WhatsApp para confirmar que o número é seu"
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 98877-1200"
          required
          aria-invalid={Boolean(erros.phone)}
        />
      </Field>

      <Field
        label="Senha"
        htmlFor="password"
        required
        error={erros.password}
        hint="Mínimo de 8 caracteres, com ao menos uma letra e um número"
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(erros.password)}
        />
      </Field>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="acceptTerms"
          required
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
        />
        <span>
          Li e aceito os{" "}
          <Link href="/termos" className="text-[var(--accent-text)] hover:underline">
            termos de uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" className="text-[var(--accent-text)] hover:underline">
            política de privacidade
          </Link>
          .
        </span>
      </label>
      {erros.acceptTerms && (
        <p role="alert" className="text-danger-700 -mt-2 text-xs font-medium">
          {erros.acceptTerms}
        </p>
      )}

      <label className="text-secondary flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="marketingConsent"
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
        />
        <span>Quero receber novidades e ofertas por e-mail.</span>
      </label>

      <Button type="submit" size="lg" fullWidth disabled={enviando}>
        {enviando ? "Criando conta…" : "Criar conta"}
      </Button>

      <p className="text-muted text-center text-xs leading-relaxed">
        Cadastro gratuito. Você só paga ao contratar um serviço.
      </p>
    </form>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Login/cadastro via Google (§6) — link GET para /api/auth/google            */
/* -------------------------------------------------------------------------- */

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function GoogleAuthButton({
  rotulo,
  redirecionar,
}: {
  rotulo: string;
  redirecionar?: string;
}) {
  const href = redirecionar
    ? `/api/auth/google?redirecionar=${encodeURIComponent(redirecionar)}`
    : "/api/auth/google";
  return (
    <a
      href={href}
      className="surface-card flex h-12 items-center justify-center gap-2.5 rounded-(--radius-pill) border text-[0.9375rem] font-semibold transition-colors hover:border-[var(--accent)]"
    >
      <GoogleIcon />
      {rotulo}
    </a>
  );
}

function DivisorOAuth() {
  return (
    <div role="separator" className="text-muted flex items-center gap-3 text-xs">
      <span className="bg-[var(--surface-muted)] h-px flex-1" />
      ou
      <span className="bg-[var(--surface-muted)] h-px flex-1" />
    </div>
  );
}
