# Coolify/HatClaw Deploy

Use GitHub as the source of truth. Every correction should be committed to
`main`; Coolify/HatClaw rebuilds from that branch.

## Application

- URL: `https://hatclaw.run.place`
- Source: GitHub
- Repository: `empurraodigital-boop/airflow-webapp`
- Branch: `main`
- Build pack: Nixpacks
- Auto deploy: enabled
- Build command: use repository `nixpacks.toml`
- Start command: use repository `nixpacks.toml`
- Health check path: `/api/health` (em `https://hatclaw.run.place/api/health`)

## Regra obrigatória de deploy automático

**Todo push para `main` dispara o deploy automático em `hatclaw.run.place` —
mas só depois de passar o gate completo.** A regra é obrigatória, não
opcional, e tem duas camadas:

1. **Gate de qualidade (CI)** — `.github/workflows/deploy.yml` roda em todo
   push para `main` (e em PRs): install, typecheck, lint, a suíte **inteira**
   de testes com PostgreSQL real de serviço (inclusive os e2e, que antes não
   rodavam em CI por falta de banco de teste) e o build de produção. Push com
   gate vermelho **não é considerado entregue**.
2. **Disparo do deploy** — com o gate verde, o job `deploy` chama o webhook
   de deploy do Coolify. Sem o secret configurado, esse job **falha de
   propósito**: o deploy automático fica bloqueado até a configuração abaixo
   ser feita.

### Ativar (uma vez, pelo dono)

1. No Coolify (`https://hatclaw.run.place`): abra o app `airflow-webapp` →
   aba **Deploy** → copie o **Deploy Webhook**.
2. No GitHub (este repositório): **Settings → Secrets and variables →
   Actions → New repository secret**: nome `COOLIFY_DEPLOY_WEBHOOK`, valor o
   webhook copiado.
3. Recomendado: **desligue o Auto Deploy** no Coolify — com o webhook ativo,
   o pipeline de CI vira a única porta de entrada para produção. Um push que
   quebra o gate nunca chega ao servidor.

Fluxo resultante:

```text
push main → CI gate (testes reais + build) → verde → webhook → hatclaw.run.place
                                          → vermelho → NADA é deployado
```

## Required Environment Variables

Copy `.env.coolify.example` into the Coolify environment variables panel and
fill the production values.

Minimum required variables:

```env
DATABASE_URL=
AUTH_SECRET=
PAYMENT_PROVIDER=sandbox
SANDBOX_WEBHOOK_SECRET=
```

For n8n/webhook automation also configure:

```env
N8N_BASE_URL=
N8N_WEBHOOK_URL=
N8N_WEBHOOK_SECRET=
BACKEND_WEBHOOK_SECRET=
```

## Database

Run migrations after the first successful deploy or whenever migrations change:

```bash
pnpm db:deploy
```

Rode o seed ao inicializar um banco novo ou quando o e-mail do admin do
operador mudar (hoje `empurraodigital@gmail.com`):

```bash
pnpm db:seed
```

Com `NODE_ENV=production` (como no `.env.coolify.example`), o seed cria só
catálogo, plano de contas, regra de comissão e o admin do operador. As contas
de demonstração têm senha pública e ficam de fora. A senha do admin vem de
`ADMIN_INITIAL_PASSWORD`; sem ela, é sorteada e aparece **uma vez** na saída do
comando. Detalhes em `docs/ADMIN-E-VERIFICACAO.md`.

## Operational Flow

1. Commit fixes to `main`.
2. GitHub Actions roda o gate completo (typecheck + lint + testes com
   PostgreSQL real + build de produção).
3. Gate verde → webhook dispara o deploy em `hatclaw.run.place`.
4. Se o deploy falhar, inspecione as linhas finais do log de build do Coolify
   e corrija o repositório.
5. Se o gate falhar, corrija e faça um novo push — o commit vermelho nunca é
   deployado.
