# Coolify/HatClaw Deploy

Use GitHub as the source of truth. Every correction should be committed to
`main`; Coolify/HatClaw rebuilds from that branch.

## Application

- Source: GitHub
- Repository: `reactflowbrasil-star/airflow-webapp`
- Branch: `main`
- Build pack: Nixpacks
- Auto deploy: enabled
- Build command: use repository `nixpacks.toml`
- Start command: use repository `nixpacks.toml`
- Health check path: `/api/health`

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

Seed only when initializing a new database:

```bash
pnpm db:seed
```

## Operational Flow

1. Commit fixes to `main`.
2. GitHub Actions runs typecheck and production build.
3. Coolify/HatClaw auto-deploys the new commit.
4. If deploy fails, inspect the final build log lines and fix the repository.

The production build intentionally does not run e2e tests because they require a
live PostgreSQL test database.
