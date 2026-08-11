# Matriz de Risco Graphify

Use esta matriz para classificar impacto antes de editar.

| Área tocada | Risco padrão | Atenção obrigatória | Gates sugeridos |
| --- | --- | --- | --- |
| `src/domain/financial` | Crítico | centavos, basis points, ledger, saldos, snapshot | `pnpm test:financial`, `pnpm gates` |
| `src/domain/state-machines` | Alta/Crítica | transições sem atalho, rollback integral | testes de domínio/e2e afetados, `pnpm gates` |
| `src/server/payments` | Crítico | webhook assinado, idempotência, PSP sandbox/real | testes de assinatura/webhook, `pnpm gates` |
| `src/server/auth` | Crítico | RBAC, ownership, 404 vs 403, sessão httpOnly | testes de autorização, revisão manual, `pnpm gates` |
| `src/server/integrations` ou n8n | Alta | outbox, HMAC, retry, dead letter, segredo em log | testes de contrato/idempotência, `pnpm gates` |
| `prisma/schema.prisma` | Alta | migration, constraints, seed, build sem banco | `pnpm db:generate`, migrations, testes e2e relevantes |
| `src/app` páginas/rotas | Média/Alta | Server vs Client Components, handlers, dados impuros | `pnpm gates`, smoke se fluxo crítico |
| `src/ui` e CSS | Média | responsividade, rolagem horizontal, tokens | `pnpm gates`, `pnpm check:layout` |
| PWA/SEO | Média | manifest, service worker, metadata, sitemap | `pnpm build`, verificação manual relevante |

Se o pedido tocar mais de uma área, use o maior risco encontrado.
