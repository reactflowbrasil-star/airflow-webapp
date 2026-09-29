/**
 * Origem pública do servidor quando um proxy reescreve o Host da requisição.
 *
 * No GitHub Codespaces, o encaminhamento de portas entrega a requisição com
 * `Host` e `X-Forwarded-Host` iguais a `localhost:<porta>`, enquanto o
 * navegador manda a `Origin` pública (`https://<codespace>-<porta>.<domínio>`).
 * Sem conhecer essa origem, a checagem de mesma origem do Estúdio recusaria o
 * próprio app, e o Next 16 recusaria os recursos de desenvolvimento (`/_next`).
 *
 * Vale só a origem exata DESTE codespace, montada de variáveis que existem
 * apenas dentro dele. Nunca um curinga como `*.app.github.dev`: aceitaria o
 * codespace de qualquer pessoa. `ORIGEM_PUBLICA` é a mesma origem gravada no
 * `.env` pelo `pnpm local:preparar`, para o caso de o processo do servidor não
 * herdar as variáveis do Codespaces.
 */
export function origemPublica(env: Record<string, string | undefined> = process.env): string | null {
  const gravada = env.ORIGEM_PUBLICA?.trim();
  if (gravada) return origemValida(gravada);

  const nome = env.CODESPACE_NAME?.trim();
  const dominio = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN?.trim();
  if (!nome || !dominio) return null;
  const porta = env.PORT?.trim() || "3000";
  return origemValida(`https://${nome}-${porta}.${dominio}`);
}

/** Só https com host: qualquer outra coisa não serve de origem confiável. */
function origemValida(valor: string): string | null {
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && url.hostname ? url.origin : null;
  } catch {
    return null;
  }
}
