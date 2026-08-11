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

export function LoginForm({ redirecionar }: { redirecionar?: string }) {
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

      <p className="text-secondary text-center text-sm">
        Ainda não tem conta?{" "}
        <Link href="/cadastrar" className="text-brand-600 font-medium hover:underline">
          Criar conta
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ papelInicial }: { papelInicial?: "CUSTOMER" | "PROVIDER" }) {
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

      router.push(papel === "PROVIDER" ? "/pro" : "/app");
      router.refresh();
    } catch {
      setErro("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {erro && <Alert tone="danger">{erro}</Alert>}

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
              className={`cursor-pointer rounded-(--radius-field) border p-3 text-center text-sm font-medium transition-colors ${
                papel === valor
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200"
                  : "surface-card hover:bg-[var(--surface-muted)]"
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
          className="accent-brand-600 mt-0.5 h-4 w-4"
        />
        <span>
          Li e aceito os{" "}
          <Link href="/termos" className="text-brand-600 hover:underline">
            termos de uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" className="text-brand-600 hover:underline">
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
          className="accent-brand-600 mt-0.5 h-4 w-4"
        />
        <span>Quero receber novidades e ofertas por e-mail.</span>
      </label>

      <Button type="submit" size="lg" fullWidth disabled={enviando}>
        {enviando ? "Criando conta…" : "Criar conta"}
      </Button>

      <p className="text-secondary text-center text-sm">
        Já tem conta?{" "}
        <Link href="/entrar" className="text-brand-600 font-medium hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
