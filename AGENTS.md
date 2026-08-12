# AGENTS.md — AirFlow

Manual de operação do repositório para agentes de código. Documento canônico:
`CLAUDE.md` importa este arquivo.

**Escreva e responda em português do Brasil.** Código, comentários, commits,
mensagens de erro e conversa. É requisito do produto (§3 do CORE-PROMPT), não
preferência de estilo.

---

## Regra obrigatória de orquestração

A skill `/graphify` é obrigatória para qualquer modificação no projeto, inclusive
mudanças de documentação, configuração, UI, backend, banco, workflows, testes ou
skills. Antes de editar, o agente deve transformar o pedido em grafo operacional:
intenção, complexidade, risco, arquivos afetados, ownership, sequência, gates,
Git automático e handoff Claude/Codex.

Toda modificação deve deixar continuidade cruzada para Claude Code e Codex:
estado, arquivos alterados, decisões, gates executados, commit/push e próximo
passo — e **toda entrega deve ser registrada na própria skill**
(`.claude/skills/graphify/references/registro-de-entregas.md`), no mesmo ciclo
e no mesmo commit. Se o trabalho mostrar que a `/graphify` falhou, ficou ambígua ou poderia
ter guiado melhor a execução, a própria skill deve ser melhorada no mesmo ciclo
quando for seguro, ou a melhoria precisa ficar registrada no handoff.

## O que é

Marketplace transacional de serviços de climatização. Cliente descreve o
problema, técnico responde com preço, os dois negociam, o cliente paga pela
plataforma e **o dinheiro fica retido** até o serviço ser concluído e
confirmado. A plataforma retém comissão e repassa o líquido.

A especificação completa está em `CORE-PROMPT.txt` (74 seções). Referências
como “§17” neste repositório apontam para lá — os comentários no código usam
essa convenção.

## Pilha

| Camada | Escolha |
| --- | --- |
| Framework | Next.js 16.3 — App Router, Server Components, `proxy.ts` (o antigo `middleware.ts`) |
| Linguagem | TypeScript 5.9, `strict` |
| Banco | PostgreSQL 16 + Prisma 7.9 (**exige driver adapter explícito**, `@prisma/adapter-pg`) |
| Estilo | Tailwind CSS 4.3 com tokens em `@theme` |
| Validação | Zod 4.4 |
| Sessão | JWT via `jose` + bcryptjs |
| Testes | Vitest 4.1 (unidade + integração) e Playwright (smoke em browser real) |

## Comandos

```bash
pnpm dev                 # desenvolvimento
pnpm gates               # typecheck + lint + testes + build  ← rode antes de commitar
pnpm test                # vitest (precisa de PostgreSQL para os e2e)
pnpm build               # produção
pnpm db:migrate          # cria e aplica migration no banco de desenvolvimento
pnpm db:seed             # catálogo, plano de contas, regra de comissão e contas demo
pnpm smoke               # jornada completa num browser real (precisa do servidor no ar)
pnpm check:layout        # rolagem horizontal em 4 viewports × 11 páginas
```

O PostgreSQL deste ambiente cai com frequência. Quando um teste e2e falhar com
`Can't reach database server`, é isso — não é o seu código:

```bash
pg_ctlcluster 16 main start
```

Os testes usam o banco **`airflow_test`**, separado do de desenvolvimento
(`vitest.config.mts` define `DATABASE_URL`). Depois de criar uma migration,
aplique-a lá também, senão os e2e quebram com “table does not exist”:

```bash
DATABASE_URL="postgresql://airflow:airflow@127.0.0.1:5432/airflow_test" pnpm exec prisma migrate deploy
```

## Arquitetura

Dependências fluem para dentro. Nada de fora atravessa uma camada.

```
src/domain    puro, zero I/O — dinheiro, comissão, ledger, máquinas de estado,
              guarda de contato, normalização de telefone
src/server    serviços, repositórios e adapters — transações, Prisma, PSP, WhatsApp
src/app       HTTP e RSC — rotas, páginas, route handlers
src/ui        componentes
```

`src/domain` não importa Prisma, `fetch`, `next/*` nem nada de `src/server`. É
o que permite testá-lo sem banco e o que mantém as regras financeiras
auditáveis.

## Invariantes

Estas não são convenções de estilo. Quebrar qualquer uma é bug.

### Dinheiro

1. **Todo valor é `Int` em centavos.** Nunca `Float`, nunca `Decimal`.
   Percentuais são **basis points** (`percentBps`): 15% = `1500`.
2. **O ledger é imutável.** Registros de `ledger_entries` e
   `ledger_transactions` nunca sofrem `UPDATE` nem `DELETE`. Correção é
   lançamento compensatório.
3. **Débitos e créditos somam igual** em toda transação, validado antes do I/O.
4. **A comissão é congelada no aceite** (`CommissionSnapshot`). Mudar a regra
   depois não altera ordem fechada. Por isso regra de comissão é *desativada*,
   nunca editada.
5. **Saldo é segregado** em `pending`, `available`, `blocked` e `inTransit`.
   Saque usa `SELECT ... FOR UPDATE`.

### Estado

6. **Toda transição passa por uma máquina de estado** (`src/domain/state-machines`).
   Não existe atalho — nem para admin. Quando a máquina recusa, a transação
   inteira reverte, inclusive o log de auditoria.
7. **Pagamento só é confirmado por webhook assinado do gateway.** Não há
   caminho no código onde o frontend declare que algo foi pago.

### Segurança

8. **Autorização é verificada no servidor**, em duas camadas: papel
   (`requireCustomer`/`requireProvider`/`requireAdmin`) e posse do recurso.
   Esconder botão não é controle de acesso.
9. **Recurso alheio responde 404, não 403.** Um 403 confirma que o id existe e
   permite enumerar. Use `assertOwnershipOrNotFound`.
10. **Nada de dado de contato entre as partes.** Telefone, e-mail, WhatsApp e
    perfis pessoais são mascarados no chat (`src/domain/messaging/contact-guard.ts`).
    Para WhatsApp, só o número oficial da plataforma envia.
11. **Segredo nunca em log, nem em desenvolvimento.** Código de verificação,
    token, chave PIX. Log de desenvolvimento vira log de produção com uma
    variável de ambiente errada.
12. **Mensagem de erro não vira oráculo.** “E-mail ou senha incorretos” é
    idêntico para conta inexistente e senha errada; “código inválido ou
    expirado” cobre os três casos.

### Build

13. **O build não pode exigir banco.** O cliente Prisma é criado
    preguiçosamente (`src/server/db/prisma.ts`), e páginas pré-renderizadas que
    leem o banco usam `consultaTolerante` (`src/server/db/prerender.ts`).
    Travado por `tests/build/prisma-lazy.test.ts`.

## Convenções

- **Comentários explicam por quê**, não o quê. Se o código não é óbvio, o
  comentário diz qual alternativa foi descartada e por quê. Não narre o óbvio.
- **Erros de domínio** usam `DomainError` com código estável — vira 422 com o
  código no corpo.
- **`correlationId`** atravessa toda operação, do handler ao log.
- **Datas no corpo de Server Component são impuras.** `new Date()` e
  `Date.now()` ficam em função fora do componente — o lint reclama, com razão.
- **`setState` dentro de `useEffect`** é recusado pelo lint. Dispare pelo
  evento que realmente causou a mudança.
- Classe utilitária que fixa `color` (como `.eyebrow`) vence utilitárias do
  Tailwind por ordem de geração. Use custom property com fallback.

## Fluxo de trabalho

1. Use `/graphify` antes de qualquer modificação.
2. Rode os gates definidos pela Graphify; `pnpm gates` é obrigatório antes de commitar quando houver código de aplicação.
3. Corrija o **defeito**, não o teste. Se um teste falha, primeiro pergunte se
   ele está certo.
4. Commit e push vão para a **`main`** (decisão do dono do projeto), e também para `claude/iniciar-projeto-7rj8km` quando aplicável.
5. Mensagem de commit em pt-BR, descrevendo o porquê e o que foi verificado.
6. **Toda entrega vira entrada no Histórico deste arquivo** (ver §Histórico)
   **e no `Registro de entregas` da skill `/graphify`**
   (`.claude/skills/graphify/references/registro-de-entregas.md` — objetivo,
   arquivos, gates, commit, estado), tudo no mesmo commit. Se a métrica de
   testes mudou, atualize-a no mesmo commit — a doc desatualizada é o que
   faz a próxima rodada refazer decisão já tomada.
7. Registre handoff Claude/Codex no relato final.
8. Se a execução revelar melhoria necessária na `/graphify`, atualize a skill ou deixe a melhoria explicitamente registrada.

## Credenciais

Nada de segredo no repositório. `.env.example` lista tudo. O que ainda **não**
foi fornecido e deixa a funcionalidade em modo sandbox:

| Variável | Efeito de estar ausente |
| --- | --- |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` | Código de verificação é gerado e gravado, mas **não é entregue**; log avisa |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Botão de login/cadastro com Google não aparece nas telas de auth |
| `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_SECRET` | Eventos acumulam no outbox sem entrega |
| Gateway de pagamento real | `PAYMENT_PROVIDER=sandbox` |
| `ADMIN_INITIAL_PASSWORD` | O seed **sorteia** a senha do admin e a imprime uma vez no log — nunca há padrão fixo no código |
| `FACIAL_BIOMETRIA_PROVIDER` | `sandbox` (default) ou `unico` — sem as chaves, o selo VERIFICADO fica em modo demonstração (liveness simulada) |
| `UNICO_CLIENT_ID` / `UNICO_CLIENT_SECRET` | Habilitam a biometria real (liveness + comparação facial) via Unico — LGPD, padrão de mercado brasileiro |

## Estado atual

| Métrica | Valor |
| --- | --- |
| Tabelas / enums | 42 / 33 |
| Rotas no build | 73 |
| Testes | 293, em 30 arquivos |
| Smoke (browser real) | 21 verificações |
| Layout | 44 combinações página × viewport |
| Workflows n8n | 15 JSONs importáveis |

Áreas: pública (`/`), cliente (`/app`), prestador (`/pro`), admin (`/admin`).

## Documentação

| Arquivo | Conteúdo |
| --- | --- |
| `docs/BLUEPRINT.md` | Blueprint técnico do §72 — decisões de arquitetura e o que está entregue vs. pendente |
| `docs/N8N-INTEGRATION.md` | Contrato de eventos, comandos e os 15 workflows |
| `docs/INTERFACES.md` | Handoff de design aplicado, Top-Nav e chat |
| `docs/ADMIN-E-VERIFICACAO.md` | Painel administrativo e verificação por WhatsApp |

---

## Histórico

Ordem cronológica do que foi construído e por quê. Serve para não refazer
decisão já tomada nem reintroduzir bug já corrigido.

### 1. Blueprint e fundação

`docs/BLUEPRINT.md` foi a primeira entrega, por exigência do §72 — antes de
código substancial. Registra também, honestamente, que as capacidades de
`/graphify` e orquestração multi-agente **não existem neste ambiente**, em vez
de simular a seção.

Em seguida: scaffolding Next 16 + TS + Tailwind 4, e as 40 tabelas iniciais do
schema com migration aplicada. (A mensagem daquele commit diz “41”; a contagem
real é 40. As duas que faltam para as 42 de hoje são `OutboundEvent`, do n8n, e
`PhoneVerification`, da verificação por WhatsApp.)

### 2. Financial Core antes do marketplace

Desvio deliberado da ordem do §68. O núcleo financeiro foi construído primeiro
porque comissão, ledger e saldo são o que o produto **é** — encaixar isso depois
de um marketplace pronto significaria reescrevê-lo. A justificativa está no
Blueprint.

Domínio puro: `money.ts` (aritmética inteira, arredondamento half-up,
`allocate()` que preserva o total), `commission.ts` (resolução por precedência
de escopo + snapshot), `ledger.ts` (partidas dobradas), `balance.ts` (saldos
segregados).

### 3. Ciclo comercial e o critério do §69

`tests/e2e/fluxo-completo.test.ts` percorre solicitação → proposta →
contraproposta → aceite → checkout PIX → webhook assinado → escrow →
agendamento → execução → conclusão → janela de segurança → liberação → repasse
→ conciliação → avaliação, contra PostgreSQL real, conferindo banco, ledger e
saldos em cada etapa. Ao final confirma que **o ledger soma zero** e sobra em
caixa exatamente a comissão.

### 4. Integração n8n

Regra dada pelo cliente: *não recriar o que já existe; reutilizar a infra e
implementar só o necessário*. O backend segue **fonte de verdade**; o n8n é só
orquestrador, nunca banco primário.

Padrão outbox: o evento é gravado na mesma transação da mudança de estado.
Entrega assíncrona com backoff `0s / 30s / 2min / 10min / 30min` e depois
`DEAD_LETTER`. Assinatura HMAC-SHA256 com timestamp e nonce contra replay.
15 workflows exportados em `infra/n8n/workflows/`, sem segredo embutido.

### 5. Redesign completo (handoff Webflow)

12 telas sobre paleta violeta, Plus Jakarta Sans e ícones Phosphor duotone,
claro e escuro. O handoff dizia que o HTML era **referência, não código de
produção** — nada foi copiado; os componentes foram reescritos sobre os tokens.

Regra de animação herdada dali e seguida em todo keyframe: **anima-se só
`transform`, nunca `opacity` a partir de 0**.

A área do prestador (`/pro`) não existia e foi construída inteira.

### 6. Chat da negociação

A tabela `Conversation` existia no schema desde o início mas **nada escrevia
nela** — a tela de Mensagens seria uma lista que nunca teria itens. Em vez de
aplicar só o visual: a conversa nasce na primeira proposta, dentro da mesma
transação, e cada evento do ciclo entra no fio com o tipo do §15.

Junto veio a guarda de contato, que **redige em vez de bloquear**: mensagem
recusada some e o usuário reescreve o número disfarçado; mensagem entregue com
o trecho mascarado mostra às duas partes que o canal é observado.

Sem tempo real. O envio faz `router.refresh()`. O SSE previsto no Blueprint
**não foi construído** — está registrado lá como pendente.

### 7. Top-Nav

O cliente indicou um componente Framer. Ele **não pôde ser importado**: depende
do runtime `framer` e busca quatro módulos em `framerusercontent.com` em tempo
de execução, o que quebraria o PWA offline. O desenho foi extraído do módulo e
reimplementado sobre os tokens — pílula de vidro, `blur(10px)`, raio 100px que
cai para 30px ao abrir o menu.

### 8. Build de produção quebrado

Três defeitos encadeados, cada um escondendo o próximo. **Não começaram com o
redesign** — os dois primeiros quebrariam qualquer checkout limpo desde o
início do projeto:

1. `src/generated/` é gitignored (correto) mas nada rodava `prisma generate`.
   Corrigido com `postinstall`.
2. O cliente Prisma era construído no topo do módulo, e o `next build` importa
   todo route handler para coletar metadados — a compilação inteira exigia a
   credencial de produção. Agora é preguiçoso, atrás de um Proxy.
3. Páginas estáticas liam o banco no prerender. `consultaTolerante` degrada
   essas leituras; o `revalidate` repõe o conteúdo quando a aplicação sobe.

Depois, outro capítulo do mesmo tema, agora do ambiente: o `next build`
pré-renderiza em paralelo e dimensionava 63 workers pelos 64 vCPUs do host,
mas o cgroup do container só permite 2 GiB — o build morria com OOM (exit
137). `experimental.cpus: 4` limita os workers, e o `dev` passou a escutar
`0.0.0.0` com a `PORT` injetada pela plataforma de preview. São ajustes de
ambiente, não de produto — não reverter sem o mesmo contexto.

### 9. Painel administrativo e verificação por WhatsApp

`/admin` com doze seções. `studioreactfly@gmail.com` é promovido a ADMIN pelo
seed mesmo se a conta já existir; a senha só é definida na criação.

Telefone virou obrigatório no cadastro: a conta nasce `PENDING_VERIFICATION` e
só ativa depois do código. O código é credencial — bcrypt em repouso, nunca em
log, uso único com consumo condicional, TTL de 10 min, 5 tentativas.

O envio usa **Evolution API GO**. O contrato foi verificado no bundle do
manager da própria instância, não presumido da documentação da v1/v2 em Node,
que tem rotas diferentes: `POST /send/text`, header `apikey`, corpo
`{number, text}`, número só em dígitos.

### 10. Analytics do funil, hardening e tipagem

O funil do §60 existia no schema (`AnalyticsEvent`) mas **nada escrevia nele**.
`registrarEvento` (`src/server/services/analytics-service.ts`) grava os 6
marcos do ciclo (iniciou_solicitacao → avaliou) com regra dura: falha de
analytics nunca derruba transação de negócio; dentro de `$transaction` sai na
mesma transação do fato. Headers de segurança no `next.config.ts` (nosniff,
referrer, frame DENY, permissions) e `poweredByHeader: false`; **CSP ficou de
fora** — nonce do RSC exige verificação de runtime que este ambiente não
permitiu, e CSP errado quebra o app inteiro silenciosamente.

Os filtros do admin usavam `as never` (tipagem burlada) e viravam 500 para
`?status=lixo` na URL — agora validam a string contra `$Enums` reais. A
validação de e-mail rodava `z.email` **antes** do `trim()`: e-mail colado do
app de contatos com espaço no fim era recusado; trocou a ordem.

### 11. Tempo real no chat (SSE)

O envio fazia `router.refresh()` só para quem enviou — quem estava do outro
lado da conversa não via mensagem nova sem recarregar. Sem WebSocket: um
stream SSE (`/api/mensagens/stream`) faz polling curto (4s) e emite
`nova-mensagem` quando há mensagem alheia ou de sistema nas conversas do
usuário; o cliente responde com `router.refresh()` e o servidor segue a única
fonte de verdade. Autorização por participação na conversa, `NOT
{senderId}` exclui a própria mensagem (sem self-trigger), abort no disconnect
com reconexão automática do EventSource. Polling é o tamanho honesto para o
produto hoje; a forma do evento não muda se um dia virar LISTEN/NOTIFY.

### 12. Cadastro e login com Google

Sem framework de auth — o repo já tem sessão própria (jose + cookie
`airflow_session` + RBAC), e uma lib criaria duas fontes de verdade sobre
"quem é o usuário". Authorization Code + PKCE à mão: `state` (CSRF), `nonce`
(anti-replay) e verificação do id_token contra o JWKS do Google via `jose`
(emissor + audiência, `email_verified` obrigatório). O e-mail é a chave de
vínculo; conta `PENDING_VERIFICATION` com o mesmo e-mail é ativada (quem
controla o e-mail controla a identidade — o Google provou isso). Conta nova
nasce ACTIVE como cliente com hash de senha impossível: técnico continua
exigindo celular/senha, porque o WhatsApp é o canal de entrega das
solicitações. O botão some sozinho sem credenciais configuradas. O `sub` do
Google não é persistido (exigiria migration) — persistir `googleId` é
hardening futuro registrado.

### 13. Dashboards do cliente e do prestador

Ambos eram bons mas sem panorama. Cliente `/app`: 4 KPIs (em negociação,
aguardando propostas, em andamento, retido na plataforma), banner de
mensagens não lidas com link direto e card do próximo atendimento. Prestador
`/pro`: banner de não lidas e "próximos" na agenda. Os contadores usam
**exatamente o mesmo critério** da lista de mensagens (`readAt: null` +
`NOT senderId`) para o badge bater com a tela; `new Date()` fora do corpo do
componente (regra de pureza); queries novas entram no mesmo `Promise.all`.

### 14. Painel admin geral (dono da plataforma)

A "Visão geral" do `/admin` virou painel operacional: serviços em andamento
com atualização automática a cada 30s (`router.refresh()` — o servidor segue
a única fonte de verdade), gráfico de área SVG puro de 14 dias (sem lib de
charts; a geometria vive em helper puro testado), pedidos por status em
barras, e atalhos para usuários/técnicos/pedidos/ledger/repasses/disputas.
A página de pedidos passou a importar o mesmo `STATUS_ORDEM` em vez de
duplicar o mapa de status.

### 15. Tela de verificação sem beco sem saída

Quem errava o número no cadastro ficava preso: o código nunca chegava e não
havia como corrigir nem desistir. A tela ganhou duas saídas de emergência —
corrigir o número (PATCH: só conta `PENDING_VERIFICATION`; mesma regra do
cadastro para número verificado por outra conta; código antigo invalidado e
novo enviado; auditoria só com número mascarado) e cancelar o cadastro
(DELETE: o `status` é a trava; log de auditoria entra antes do DELETE e a FK
SET NULL preserva o rastro; sessão encerrada; e-mail e número liberados para
recomeçar). No caminho, o redirecionamento pós-confirmação passou a respeitar
o papel — técnico ia parar em `/app`.

### 18. Acompanhamento completo da jornada em tempo real

O cliente passou a acompanhar todas as etapas do atendimento — do deslocamento
à avaliação — sem recarregar a página:

- **Página `/app/pedidos/[orderId]`**: timeline da jornada (proposta aceita →
  pagamento retido → agendado → a caminho → chegou → em andamento → conclusão
  → repasse → avaliação), com a etapa atual destacada e datas nas concluídas.
  As etapas são derivadas de estado real (ordem/agendamento/pagamento) por
  helper puro testado (`src/lib/service-timeline.ts`).
- **Jornada do prestador em etapas**: o A_CAMINHO deixou de ser transitório
  (o START pulava direto para EM_ANDAMENTO numa transação). Agora há
  `GO_EN_ROUTE` (com previsão de chegada opcional) e `MARK_ARRIVED` — a
  chegada não tem status no schema, então é um marco de mensagem
  (`metadata.kind === "provider_arrived"`), idempotente.
- **Tempo real (SSE, mesmo padrão do chat)**: `/api/cliente/pedidos/[orderId]/
  stream` recarrega a página de acompanhamento quando a jornada muda;
  `/api/cliente/pedidos/stream` faz o dashboard recarregar sozinho.
- **Registro fotográfico**: o prestador envia fotos (Antes/Depois/Outros,
  canvas 1280px no cliente, ≤ 1 MB, até 6) que entram no fio da conversa como
  mensagens IMAGE (§15) — o cliente vê na página de acompanhamento. A
  `MensagemAutomatica` ganhou `attachmentUrl`.
- **Avaliação (§36)**: `POST /api/avaliacoes` (só cliente, ordem concluída,
  uma por pedido, reputação bayesiana recalculada na transação) + formulário
  de estrelas na página.
- **Pagamento**: valor final e status (retido em escrow até a confirmação) +
  atalho para o checkout quando pendente.

Regra mantida: a confirmação da conclusão é do cliente — o profissional não
encerra o próprio serviço sozinho (§35).

### 20. Fluxo de contratação no modelo Uber: recusa, timeout e redistribuição

Fechou os gaps do fluxo de oferta em tempo real (§16):

- **Recusa explícita da oferta** — `POST /api/prestador/alertas/[id]/recusar`:
  quem recusa vai para o fim da fila e os próximos candidatos são notificados
  na hora, sem esperar o timeout do lock (antes, só existia aceitar ou deixar
  vencer). A rotação foi extraída num helper compartilhado
  (`rotacionarEAlertarProximaFila`) usado pela recusa, pela liberação da
  negociação e pelo job.
- **Timeout da oferta** — job `/api/jobs/timeouts` (mesma autenticação HMAC
  do outbox, chamável por cron/n8n a cada ~5 min): lock de negociação vencido
  devolve a solicitação à fila (redistribuição automática) e solicitação
  aberta sem resposta em 48h expira (`EXPIRADA` + dispatch `ENCERRADA`).
  Antes, ofertas vencidas nunca rodavam e solicitação nunca expirava.
- **Cancelamento pelo cliente** — `DELETE /api/solicitacoes/[id]` (posse na
  consulta, máquina de estados como trava, dispatch encerrado e candidatos
  fechados, auditoria) + botão com confirmação em duas etapas.
- **"Buscando prestadores" para o cliente** — card em tempo real na
  solicitação: fase do disparo (buscando / negociação), quantos profissionais
  foram notificados e a mensagem de que a busca continua automaticamente.
- **Aceite simultâneo** já era seguro (update condicional com
  `activeProviderId: null` + idempotência) — coberto por e2e novo.

Gaps registrados (sem migration): "prestador que não se desloca" (regra de
cancela por atraso de chegada) e "cliente ausente" ficam para um ciclo com
schema novo; a perda de conexão já é tratada pela reconexão automática do
EventSource.

### 21. Varredura geral: rotas fantasma, data impura e máquina facial tipada

Varredura por falhas em todo o sistema, seguindo os padrões de defeito já
conhecidos (§Defeitos) e o sitemap:

- **Bug #10 ressuscitado**: `/servicos/[slug]` e `/tecnicos/[slug]` estavam
  no sitemap e na home **sem página** (404). O conteúdo real vive na busca
  filtrada — agora as duas URLs fazem `permanentRedirect` (308) para
  `/tecnicos?categoria=` e `/tecnicos?cidade=`, preservando o slug e
  indexando `noindex` (conteúdo duplicado com a busca).
- **Link quebrado** `/app/avaliar/[id]` (rota que nunca existiu — o
  formulário de avaliação vive em `/app/pedidos/[orderId]`): o botão
  "Avaliar" da solicitação apontava para 404. Corrigido o href.
- **Data impura no corpo do componente** (regra do repo): o copyright usava
  `new Date().getFullYear()` direto no JSX da home **e** do layout de auth.
  Extraído para helper puro fora do componente.
- **Único `as never` do código** (burlar o typecheck, contra o padrão do
  repo): a máquina de validação facial era um objeto cru com `includes(... as
  never)`. Reescrita sobre o `defineStateMachine` central (§52) — transição
  inválida agora lança, como nas outras 10 máquinas.

Verificado e limpo: guards das quatro áreas (papel + posse), hrefs estáticos
(e dinâmicos) contra as rotas do build, `hidden md:` com fallback mobile nos
shells (defeito do `<aside>` não voltou), `z.email` depois do `trim()`,
robots.ts e todos os `new Date()` de página dentro de helpers.

### 22. "Esqueci minha senha" — recuperação com código no WhatsApp

O login não tinha saída para quem esqueceu a senha. Agora há, no padrão de
segurança do cadastro:

- **Fluxo em 2 etapas**: e-mail → código de 6 dígitos por WhatsApp para o
  telefone verificado da conta → nova senha. Página `/recuperar-senha` + link
  no formulário de login; o proxy redireciona quem já está logado.
- **Anti-oráculo**: a resposta do pedido é idêntica (202 `{ok:true}`) para
  e-mail inexistente, conta sem telefone verificado e conta OK — e o caminho
  inexistente gasta um bcrypt inútil para igualar o tempo de relógio (mesmo
  truque do `authenticateUser`). Mensagens de erro genéricas em todos os
  casos.
- **Reuso da disciplina de código**: `PhoneVerification` ganhou
  `purpose: RESET_SENHA`; `consumirCodigo` foi extraído do cadastro e
  compartilhado — hash em repouso, uso único com consumo condicional, TTL,
  5 tentativas, rate limit por IP nas rotas.
- **Revogação de sessão real**: `User.passwordChangedAt` + `iat` do JWT —
  `getSession` recusa token emitido antes da troca. É o único SELECT do
  caminho de sessão (por PK), preço de revogar JWT stateless de verdade; a
  regra é função pura testada (`sessaoRevogadaPorTrocaDeSenha`). Cookie do
  dispositivo atual é limpo na troca.
- Contas criadas via Google não têm senha utilizável — o reset via WhatsApp
  continua valendo para elas (o código prova posse do telefone, não da senha).

Migration `20260812_recuperar_senha`: enum `RESET_SENHA` + `passwordChangedAt`
(CI aplica via `prisma migrate deploy`).

### 23. Deploy desbloqueado: migration corrompida e suíte e2e no vermelho desde a #18

O deploy automático em `hatclaw.run.place` estava bloqueado há rodadas — todo
push para `main` falhava no gate e nada chegava ao servidor. Dois defeitos
encadeados:

1. **Migration com stdout do Prisma capturado**: ao gerar
   `20260812_recuperar_senha` com `prisma migrate diff --script > arquivo`, a
   linha `Loaded Prisma config from prisma.config.ts.` do log do CLI entrou no
   topo do `migration.sql`. O PostgreSQL falhava com `syntax error at or near
   "Loaded"`, o `prisma migrate deploy` do gate morria e o deploy nunca era
   disparado (o job de webhook só roda com gate verde). Corrigido removendo a
   linha; o SQL restante já era válido.
2. **A suíte e2e estava vermelha desde a rodada #18 — mascarada pelo item 1**:
   a mudança deliberada da máquina de estado (START exige `A_CAMINHO`; o
   `A_CAMINHO` deixou de ser transitório) quebrou os e2e antigos que iniciavam
   o serviço direto do agendado (chat, financeiro §64, fluxo completo §69,
   n8n, operação do prestador) — como o gate morria antes dos testes, ninguém
   viu. Os testes foram atualizados para o fluxo novo (`markProviderEnRoute`
   antes do `START`; o fio da conversa ganhou a mensagem SYSTEM do "a caminho").

No caminho, os e2e novos que nunca tinham rodado com banco real revelaram
falhas próprias, corrigidas: `dispatch-timeout` não resetava o banco entre
os testes (candidatos de um teste vazavam para o seguinte) e assumia que a
ordem da fila era a de criação (o ranking ordena por distância — o teste
agora é agnóstico e valida posições 1..n e o conjunto, não a ordem);
`password-reset` criava o usuário duas vezes (`comCodigo` + o teste) e
esperava o telefone sem o `+55` que o serviço normaliza; e a recusa de sessão
facial alheia era engolida pelo catch-all do serviço (`FACIAL_PROVIDER_UNAVAILABLE`)
em vez de virar o `INVALID_SESSION` que a defesa promete — o serviço agora
mapeia os códigos de sessão do provedor para `INVALID_SESSION` antes do
catch-all.

### 19. Validação facial — nível VERIFICADO com biometria

O painel do prestador ganhou o fluxo de validação facial por biometria, com
selo em destaque:

- **Captura real pela câmera** (`getUserMedia`, preview espelhado, 720×720) —
  a análise biométrica (liveness + comparação facial) roda no provedor
  configurado: **sandbox** por padrão (liveness simulada, captura real) ou
  **Unico** via `FACIAL_BIOMETRIA_PROVIDER=unico` + `UNICO_CLIENT_ID/SECRET`
  (adapter pronto, contrato da API marcado para validação antes de ativar).
  Mesmo padrão do PSP: interface `FacialProvider`, registry por env.
- **Sem migration**: o selo é derivado de um documento `SELFIE` APROVADO
  (tipo já existia no schema) + `verified = true` — gravados na mesma
  transação, com auditoria `FACIAL_VERIFIED` e marco de analytics.
- **Sessão assinada de 10 min** (cookie JWT `facial_session`, mesmo padrão do
  auth): liga a sessão do provedor ao prestador — sessão de outro é recusada
  (defesa dupla: cookie + vínculo no próprio provedor sandbox).
- **Selo VERIFICADO** (`SeloVerificado`): gradiente com shield, "VERIFICADO ·
  biometria facial", no perfil, no dashboard (substitui o CTA "Validar
  identidade") e na página `/pro/verificacao/facial` (fluxo completo).

### 17. Área do prestador elevada: tempo real, foto e mapa

O painel do prestador ganhou o que faltava para operar sem sair do celular:

- **Solicitações em tempo real com alerta sonoro** — o componente
  `ProviderDispatchAlerts` existia mas **nunca era montado** (código morto).
  Agora vive no topo do `/pro` e de `/pro/solicitacoes`, assinando o stream
  SSE `/api/prestador/solicitacoes/stream` (mesmo padrão do chat): o servidor
  avisa quando o conjunto de alertas muda e o cliente recarrega e toca o som
  (Web Audio, sem asset). O polling em 8s virou plano B.
- **Foto do perfil** — `User.avatarUrl` existia no schema e nada usava. O
  upload redimensiona no cliente (canvas 512×512, crop quadrado, JPEG 0.85)
  e grava como data URL via `PATCH /api/prestador/perfil/foto` — sem storage
  externo; o tamanho é a defesa (≤ 512 KB no banco).
- **Mapa interativo e direção guiada** — sem lib de mapas: OSM entra como
  iframe de embed (sem chave) e os botões abrem Google Maps/Waze da base do
  prestador até as coordenadas do endereço do cliente (`Address` já tinha
  latitude/longitude). Geometria e URLs vivem em `src/lib/service-map.ts`,
  puras e testadas.
- **Edição de serviços** — o save já era upsert; o formulário ganhou
  "Editar" que pré-preenche e grava sobre o serviço existente.

Decisão de segurança: a localização exibida é o endereço da solicitação — o
mesmo dado que o dispatch já usa para ranquear por distância; nada de
rastreamento GPS contínuo (não existe no schema, ficou registrado como gap).

### 16. Deploy automático obrigatório em hatclaw.run.place

Regra de duas camadas. **Gate**: `.github/workflows/deploy.yml` roda em todo
push para `main` (e em PRs) — install, typecheck, lint, a suíte inteira de
testes com PostgreSQL real de serviço no CI (os e2e antes não rodavam em CI
por falta de banco de teste) e o build de produção; push com gate vermelho
não é considerado entregue. **Disparo**: com o gate verde, o job `deploy`
chama o webhook do Coolify; sem o secret `COOLIFY_DEPLOY_WEBHOOK`
configurado, o job falha de propósito — o deploy automático fica bloqueado
até o dono configurar (o secret vive no GitHub Actions, não no `.env` do
app). Regra documentada em `COOLIFY.md`, agora com a URL do servidor.

---

## Defeitos já encontrados (não reintroduzir)

Cada um destes custou uma investigação. Vários só apareceram ao rodar de
verdade — `tsc` e `eslint` passavam.

| Defeito | Causa |
| --- | --- |
| `-0` vindo de `providerLedgerBalance` | Negação de zero em JS. Corrigido na origem, não no teste. |
| `Property 'adapter' is missing` | Prisma 7 exige driver adapter explícito. |
| `hidden sm:inline-flex` não escondia | Ordem de geração do CSS decide, não a ordem no atributo. Use `max-sm:hidden`. |
| Metadados de saldo vazando | Domínio e repositório iteravam chaves desconhecidas. Corrigido nos dois lados. |
| `withApiHandler` de aridade fixa | Só quebrava em `next build` (tipos de rota gerados no build), não em `tsc --noEmit`. |
| Homepage virou dinâmica | `getSession()` num header compartilhado. Página pública não lê sessão. |
| IDOR devolvia 500 | Faltava guard de página; agora 404. |
| `<aside>` reservando 208px no mobile | O `hidden` estava no filho, não no `<aside>`. |
| Auditoria de risco revertida | O erro que bloqueava desfazia o próprio log. Mover a checagem para antes da transação. |
| `.eyebrow` ilegível em bolha gradiente | `color` fixo vencia a utilitária do Tailwind. Custom property com fallback. |
| Smoke expandia o hambúrguer | Dois disclosures com `aria-expanded`; escope o seletor ao `<main>`. |
| Função passada de RSC para client | `rotas.proposta` era função. Passe URL já resolvida. |
| Auto-submit do código nunca disparava | **`"abc".includes("")` é sempre `true`.** |
| `/verificar` dava 500 para anônimo | Faltava `guardaDePagina` na chamada de `requireSession`. |
| `/servicos/[slug]` e `/tecnicos/[slug]` devolvendo 404 (reincidência do bug #10) | Anunciadas no sitemap e linkadas na home sem página. Corrigido com `permanentRedirect` para a busca filtrada + `noindex`. |
| Botão "Avaliar" da solicitação → 404 | href apontava para `/app/avaliar/[id]`, rota inexistente — o formulário vive em `/app/pedidos/[orderId]`. |
| Máquina facial com `as never` | Burlava o typecheck; reescrita sobre `defineStateMachine` (transição inválida lança). |
| `/servicos` e `/seja-prestador` em 404 | Estavam no cabeçalho **e no sitemap** desde o início, sem página. |
| Tela de verificação presa | O fluxo não previa corrigir o número nem cancelar — o cadastro errado virava beco sem saída. Agora PATCH corrige e DELETE cancela, ambos travados pelo status `PENDING_VERIFICATION`. |
| Deploy bloqueado: `syntax error at or near "Loaded"` no `migration.sql` | A linha `Loaded Prisma config from prisma.config.ts.` (stdout do CLI) foi capturada no topo da migration gerada com `prisma migrate diff --script > arquivo`. Nunca capture stdout do CLI dentro de arquivo de migration — gere em um passo e grave em outro. |
| Suíte e2e no vermelho mascarada por meses de gate quebrado | A mudança da máquina de estado (START exige `A_CAMINHO`) quebrou os e2e que iniciavam direto do agendado, mas o gate morria na migration antes dos testes rodarem. O CI só é confiável como regressão se a etapa de migrations também for verde — e um gate que nunca roda testes não protege nada. |
| `dispatch-timeout` flakiness | Sem reset do banco entre testes, candidatos de um teste vazavam para o seguinte; e o teste assumia que a fila segue a ordem de criação (o ranking ordena por distância). |
| `password-reset` P2002 e telefone sem `+55` | `comCodigo` criava o usuário que o teste já tinha criado; e a expectativa ignorava a normalização E.164 do serviço. |
| Sessão facial alheia virava `FACIAL_PROVIDER_UNAVAILABLE` | O catch-all do serviço engolia o `SESSION_PROVIDER_MISMATCH` do provedor. Mapeie códigos de sessão antes do catch-all. |
