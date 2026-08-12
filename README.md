# AirFlow — Marketplace Transacional de Climatização

Plataforma que conecta clientes a técnicos de ar-condicionado controlando o ciclo
comercial completo dentro do sistema: descoberta → solicitação → proposta →
negociação → contratação → pagamento → agendamento → execução → comissão →
repasse → avaliação.

A especificação de produto está em [`CORE-PROMPT.txt`](./CORE-PROMPT.txt).
O desenho técnico está em [`docs/BLUEPRINT.md`](./docs/BLUEPRINT.md).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, Server Components) |
| Linguagem | TypeScript 5.9 `strict` |
| Banco | PostgreSQL 16 + Prisma 7 |
| Estilo | Tailwind CSS 4 + design system por tokens |
| Validação | Zod 4 (server-side) |
| Auth | JWT em cookie `httpOnly` (jose) + bcrypt |
| Testes | Vitest 4 |

---

## Requisitos

- Node.js 22+
- pnpm 10+
- PostgreSQL 16 acessível

## Como rodar

```bash
pnpm install

# Configure a conexão e o segredo de sessão
cp .env.example .env
# edite DATABASE_URL e AUTH_SECRET

pnpm db:migrate     # aplica as migrations
pnpm db:seed        # catálogo, plano de contas e usuários de demonstração

# Para rodar os testes de integração, prepare o banco de teste:
createdb airflow_test
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/airflow_test" \
  DATABASE_URL="$TEST_DATABASE_URL" pnpm prisma migrate deploy

pnpm dev            # http://localhost:3000
```

### Usuários de demonstração (criados pelo seed)

| Papel | E-mail | Senha |
|---|---|---|
| Administrador | `admin@airflow.local` | `Demo1234` |
| Cliente | `cliente@airflow.local` | `Demo1234` |
| Prestador | `tecnico@airflow.local` | `Demo1234` |

---

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm typecheck` | Verificação de tipos |
| `pnpm lint` | ESLint |
| `pnpm test` | Suíte completa de testes |
| `pnpm test:financial` | Apenas os testes financeiros obrigatórios (§64) |
| `pnpm test:e2e` | Fluxo ponta a ponta do §69 (exige PostgreSQL de teste) |
| `pnpm gates` | Quality Gates: typecheck + lint + testes + build |
| `pnpm db:migrate` | Aplica migrations em desenvolvimento |
| `pnpm db:seed` | Popula o banco |
| `pnpm db:reset` | Recria o banco do zero |
| `pnpm icons` | Regera os ícones do PWA |
| `pnpm check:layout` | Verifica rolagem horizontal em 4 viewports (requer app no ar) |
| `pnpm smoke` | Percorre a jornada do cliente num browser real (requer app no ar) |

---

## Arquitetura

Dependências apontam sempre **para dentro**. `src/domain` não conhece HTTP,
React, Prisma nem gateway de pagamento.

```
src/
├── app/         Next.js — páginas e Route Handlers (I/O)
├── server/      Serviços, repositórios, auth, adapters de PSP
├── domain/      Regras puras: money, comissão, ledger, máquinas de estado
├── ui/          Design System
└── lib/         Utilitários e validação
```

### Regras invioláveis

1. **Dinheiro é inteiro em centavos.** `R$ 300,00` = `30000`. Nunca `float`.
2. **O ledger nunca é apagado nem editado.** Correção gera lançamento reverso.
3. **O backend é a fonte de verdade financeira.** A UI apenas representa estado.
4. **Nenhum efeito financeiro duplicado.** Idempotência em três camadas.
5. **RBAC é verificado no servidor.** Esconder botão não é controle de acesso.

---

## Estado atual

Consulte o roadmap completo em [`docs/BLUEPRINT.md`](./docs/BLUEPRINT.md#23-roadmap-68).

**Implementado**
- Modelo de dados completo (41 tabelas) com migration aplicada
- Financial Core: money em centavos, commission engine com precedência e
  versionamento, snapshot imutável, ledger de partidas dobradas, saldos
  segregados, 10 máquinas de estado
- Fluxo comercial completo no backend: solicitação → proposta → negociação →
  aceite → checkout → webhook → agendamento → execução → liquidação →
  liberação de saldo → repasse → conciliação → avaliação
- Abstração `PaymentProvider` com adapter sandbox (assinatura HMAC real)
- Autenticação e RBAC server-side, rate limiting, logs com `correlationId`
- Design System, homepage, PWA (manifest + service worker), SEO
- Jornada do cliente na interface: cadastro/login, busca por intenção, perfil
  público do técnico, wizard de solicitação em 5 passos, negociação com
  contraproposta, checkout PIX e timeline de acompanhamento
- Páginas institucionais e de LGPD (termos, privacidade, como funciona, segurança)
- Funil de analytics (§60) instrumentado nos 6 marcos do ciclo comercial
- Chat com tempo real via SSE: o stream avisa quando há mensagem nova e a tela refaz a leitura sem recarregar
- **247 testes** (24 arquivos) + smoke da jornada num browser real

**Pendente** — o mapa na busca, a integração com um PSP real, o job de retry
de pagamento, o serviço de chargeback, o hardening da Fase 11 e a
persistência do `googleId` no cadastro via Google.
