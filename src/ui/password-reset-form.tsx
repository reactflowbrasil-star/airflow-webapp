"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert, Button, Field, Icon, Input } from "@/ui";

/**
 * Recuperação de senha em duas etapas (§6):
 *
 *   1. E-mail → o sistema envia um código para o WhatsApp cadastrado.
 *   2. Código + nova senha → troca a senha e volta para o login.
 *
 * A mensagem da etapa 1 é propositalmente genérica (\"se houver uma conta…\"):
 * o servidor não revela se o e-mail existe, e a tela também não.
 */

const DIGITOS = 6;

export function PasswordResetForm() {
  const router = useRouter();
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [valores, setValores] = useState<string[]>(Array(DIGITOS).fill(""));
  const [senha, setSenha] = useState("");

  const codigo = valores.join("");

  function preencher(indice: number, texto: string) {
    const digitos = texto.replace(/\D/g, "");
    if (!digitos) return;
    const novos = [...valores];
    for (let i = 0; i < digitos.length && indice + i < DIGITOS; i += 1) {
      novos[indice + i] = digitos[i];
    }
    setValores(novos);
    // O botão de confirmar usa o estado; auto-submit ao completar.
    const completo = novos.join("");
    if (completo.length === DIGITOS && senha.length >= 8) {
      void confirmar(completo);
    }
  }

  async function solicitar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch("/api/auth/recuperar-senha", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível solicitar o código");
        return;
      }
      // Mesma mensagem em todos os casos — o servidor não confirma existência.
      setAviso(
        "Se houver uma conta com este e-mail, enviamos um código por WhatsApp para o número cadastrado. Confira seu WhatsApp.",
      );
      setEtapa(2);
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar(codigoDireto?: string) {
    const aConfirmar = codigoDireto ?? codigo;
    if (aConfirmar.length !== DIGITOS || senha.length < 8 || ocupado) return;
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch("/api/auth/redefinir-senha", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, codigo: aConfirmar, novaSenha: senha }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(corpo?.error?.message ?? "Não foi possível redefinir a senha");
        setValores(Array(DIGITOS).fill(""));
        return;
      }
      router.push("/entrar?redefinida=1");
      router.refresh();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {erro && <Alert tone="danger">{erro}</Alert>}
      {aviso && <Alert tone="brand">{aviso}</Alert>}

      {etapa === 1 ? (
        <form onSubmit={solicitar} className="flex flex-col gap-4">
          <Field
            label="E-mail da conta"
            htmlFor="email"
            required
            hint="Enviaremos um código por WhatsApp para o número cadastrado nesta conta"
          >
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Button type="submit" size="lg" fullWidth disabled={ocupado || !email.trim()}>
            {ocupado ? "Enviando…" : "Enviar código"}
          </Button>

          <p className="text-center text-sm">
            <Link
              href="/entrar"
              className="font-semibold text-[var(--accent-text)] hover:underline"
            >
              <Icon name="arrow-left" className="mr-1.5" />
              Voltar para entrar
            </Link>
          </p>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-secondary text-sm leading-relaxed">
            Digite o código de 6 dígitos recebido por WhatsApp e defina sua nova
            senha.
          </p>

          <div>
            <label
              htmlFor="codigo-0"
              className="block text-[0.8125rem] font-semibold"
            >
              Código de 6 dígitos
            </label>
            <div className="mt-2 flex justify-center gap-2" role="group">
              {valores.map((valor, i) => (
                <Input
                  key={i}
                  id={`codigo-${i}`}
                  value={valor}
                  onChange={(e) => preencher(i, e.target.value)}
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={DIGITOS}
                  aria-label={`Dígito ${i + 1} de ${DIGITOS}`}
                  disabled={ocupado}
                  className="num h-14 w-11 px-0 text-center text-xl font-bold"
                />
              ))}
            </div>
          </div>

          <Field
            label="Nova senha"
            htmlFor="nova-senha"
            required
            hint="Mínimo de 8 caracteres, com ao menos uma letra e um número"
          >
            <Input
              id="nova-senha"
              name="novaSenha"
              type="password"
              autoComplete="new-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </Field>

          <Button
            type="submit"
            size="lg"
            fullWidth
            disabled={ocupado || codigo.length !== DIGITOS || senha.length < 8}
          >
            {ocupado ? "Redefinindo…" : "Redefinir senha"}
          </Button>

          <p className="text-center text-sm">
            <button
              type="button"
              onClick={() => {
                setEtapa(1);
                setValores(Array(DIGITOS).fill(""));
                setSenha("");
                setAviso(null);
              }}
              className="font-semibold text-[var(--accent-text)] hover:underline"
              disabled={ocupado}
            >
              <Icon name="arrow-left" className="mr-1.5" />
              Voltar
            </button>
          </p>
        </form>
      )}
    </div>
  );
}
