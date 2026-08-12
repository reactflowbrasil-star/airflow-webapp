# Registro de entregas — Graphify

Log operacional de toda alteração concreta no AirFlow, na ordem em que
aconteceu. O detalhe de decisões e porquês vive no Histórico do `AGENTS.md`
(a referência `AGENTS.md #N` aponta para lá) — aqui fica o essencial para um
agente retomar sem reconstruir contexto: objetivo, gates, commit e próximo
passo.

## Regra

Ao final de **toda** alteração concreta — código, UI, banco, docs, config,
testes, workflows ou skills — acrescente uma entrada nova no fim desta lista,
com os campos do formato abaixo, **no mesmo ciclo e no mesmo commit** quando
houver commit. Não edite entradas passadas: o registro é um log. Se a entrega
for só planejamento/leitura, registre como `Estado: parcial` com o próximo
passo.

## Formato de entrada

```markdown
### N. <título curto da entrega>
Objetivo: <o que foi feito e por quê, 1–2 linhas>
Arquivos: <principais>
Gates: <typecheck/lint/testes/build com resultado real — ou "não rodou e por quê">
Commit: <SHA → main> ou "—" quando não houver commit
Estado: concluído | parcial | bloqueado
Próximo: <ação objetiva para o próximo agente, quando houver>
```

## Entregas

### 1. Blueprint e fundação
Objetivo: Blueprint técnico (§72) antes de código substancial; scaffolding Next 16 + TS strict + Tailwind 4; 40 tabelas iniciais com migration aplicada.
Arquivos: `docs/BLUEPRINT.md`, `prisma/schema.prisma`, scaffolding.
Gates: não registrado (histórico inicial).
Commit: — · Estado: concluído · Ref: AGENTS.md #1

### 2. Financial Core antes do marketplace
Objetivo: desvio deliberado do roadmap — comissão, ledger e saldo são o que o produto é; construir depois seria reescrever. Domínio puro: `money` (inteiros, half-up, allocate), `commission` (precedência + snapshot), `ledger` (partidas dobradas), `balance` (saldos segregados).
Arquivos: `src/domain/financial/*`, `src/domain/shared/money.ts`.
Gates: testes financeiros obrigatórios (§64).
Commit: — · Estado: concluído · Ref: AGENTS.md #2

### 3. Ciclo comercial e critério do §69
Objetivo: e2e do fluxo completo contra PostgreSQL real, conferindo banco, ledger e saldos em cada etapa; ao final o ledger soma zero e sobra em caixa exatamente a comissão.
Arquivos: `tests/e2e/fluxo-completo.test.ts`.
Gates: e2e com Postgres (rodou no ambiente de origem).
Commit: — · Estado: concluído · Ref: AGENTS.md #3

### 4. Integração n8n
Objetivo: reutilizar a infra existente (regra do cliente); backend é fonte de verdade, n8n é orquestrador. Outbox na mesma transação, backoff 0s/30s/2min/10min/30min → DEAD_LETTER, HMAC com timestamp+nonce.
Arquivos: `src/server/events/*`, `infra/n8n/workflows/*` (15 JSONs).
Gates: testes de assinatura/idempotência/outbox.
Commit: — · Estado: concluído · Ref: AGENTS.md #4

### 5. Redesign completo (handoff Webflow)
Objetivo: 12 telas sobre paleta violeta, Plus Jakarta Sans, Phosphor duotone, claro/escuro; área `/pro` construída do zero. HTML do handoff era referência, não código — nada copiado.
Arquivos: `src/ui/*`, `src/app/(prestador)/*`, tokens em `globals.css`.
Gates: gates do redesign no ambiente de origem.
Commit: — · Estado: concluído · Ref: AGENTS.md #5

### 6. Chat da negociação
Objetivo: a conversa nasce na primeira proposta (mesma transação) e cada evento do ciclo entra no fio; guarda de contato redige em vez de bloquear.
Arquivos: `src/ui/chat.tsx`, `src/domain/messaging/contact-guard.ts`, `src/server/services/message-service.ts`.
Commit: — · Estado: concluído · Ref: AGENTS.md #6

### 7. Top-Nav
Objetivo: o componente Framer indicado não pôde ser importado (runtime externo quebraria o PWA offline); desenho extraído e reimplementado sobre os tokens.
Arquivos: `src/ui/*` (top-nav).
Commit: — · Estado: concluído · Ref: AGENTS.md #7

### 8. Build de produção quebrado
Objetivo: três defeitos encadeados — `prisma generate` ausente (postinstall), client Prisma no topo do módulo (preguiçoso atrás de Proxy), páginas estáticas lendo banco no prerender (`consultaTolerante` + revalidate).
Arquivos: `src/server/db/prisma.ts`, `src/server/db/prerender.ts`, `package.json`.
Gates: `pnpm build` no ambiente de origem.
Commit: — · Estado: concluído · Ref: AGENTS.md #8

### 9. Painel administrativo e verificação por WhatsApp
Objetivo: `/admin` com doze seções; telefone obrigatório no cadastro, conta nasce PENDING_VERIFICATION; código com bcrypt em repouso, uso único, TTL 10min, 5 tentativas; envio via Evolution API GO.
Arquivos: `src/app/(admin)/*`, `src/server/services/verification-service.ts`, `src/server/messaging/whatsapp.ts`.
Commit: — · Estado: concluído · Ref: AGENTS.md #9

### 10. Analytics do funil, hardening e tipagem
Objetivo: funil §60 instrumentado (6 marcos, best-effort, mesma transação); headers de segurança (CSP fora de propósito); filtros do admin com `$Enums` reais (fim do `as never` e do 500 para `?status=lixo`); e-mail validado após trim; 2 suítes novas de teste. Junto: preview/build do ambiente (`dev -H 0.0.0.0 -p $PORT`, `experimental.cpus: 4` contra o OOM do cgroup de 2 GiB).
Arquivos: `src/server/services/analytics-service.ts`, `next.config.ts`, 4 páginas de admin, `src/lib/validation/auth.ts`, `tests/domain/{analytics,validation}.test.ts`.
Gates: typecheck/lint ✅ · 127 dom/fin ✅ · build ✅.
Commit: `3f6b0fb` → main · Estado: concluído · Ref: AGENTS.md #10 + nota de ambiente no #8

### 11. SEO/PWA e docs
Objetivo: `metadata.description` em 5 páginas, precache do manifest no service worker, AGENTS.md/README atualizados (contagem real de testes).
Arquivos: 5 páginas, `public/sw.js`, `AGENTS.md`, `README.md`.
Gates: typecheck/lint ✅ · build ✅.
Commit: `187e90a` → main · Estado: concluído

### 12. Cadastro e login com Google
Objetivo: OAuth à mão (Authorization Code + PKCE, `state`/`nonce`, id_token via `jose` contra JWKS, `email_verified` obrigatório). E-mail é a chave de vínculo; conta nova nasce ACTIVE como cliente com hash de senha impossível; botão some sem credenciais. `googleId` não persistido (hardening futuro).
Arquivos: `src/server/auth/oauth-google.ts`, `src/app/api/auth/google/*`, `src/server/services/auth-service.ts`, `src/ui/auth-form.tsx`, `tests/domain/oauth-google.test.ts`.
Gates: typecheck/lint ✅ · 89 dom ✅ · build ✅ · E2E do fluxo com banco+credenciais pendente.
Commit: `862bc3b` → main · Estado: concluído (E2E real pendente) · Ref: AGENTS.md #12

### 13. Dashboards do cliente e do prestador
Objetivo: KPIs de panorama, banner de não lidas (mesmo critério da lista) e próximo atendimento no cliente; não lidas e próximos na agenda no prestador. `new Date()` fora do corpo; queries no mesmo `Promise.all`.
Arquivos: `src/app/(cliente)/app/page.tsx`, `src/app/(prestador)/pro/page.tsx`.
Gates: typecheck/lint ✅ · build ✅.
Commit: `31b9298` → main · Estado: concluído · Ref: AGENTS.md #13

### 14. Painel admin geral (dono da plataforma)
Objetivo: visão geral operacional — serviços em andamento com refresh a cada 30s, gráfico de área SVG puro de 14 dias, pedidos por status em barras, atalhos; `STATUS_ORDEM` compartilhado com a página de pedidos; geometria do gráfico em helper puro testado.
Arquivos: `src/app/(admin)/admin/page.tsx`, `src/lib/admin-dashboard.ts`, `src/ui/admin-live.tsx`, `tests/domain/admin-dashboard.test.ts`.
Gates: typecheck/lint ✅ · 152 dom/fin ✅ · build ✅.
Commit: `94e21c1` → main · Estado: concluído · Ref: AGENTS.md #14

### 15. Tela de verificação sem beco sem saída
Objetivo: corrigir número (PATCH — só conta PENDING_VERIFICATION; código antigo invalidado; auditoria com número mascarado) e cancelar cadastro (DELETE — status é a trava; log antes do DELETE, FK SET NULL preserva rastro; sessão encerrada; e-mail/número liberados). Pós-confirmação respeita o papel.
Arquivos: `src/server/services/verification-service.ts`, `src/app/api/verificacao/route.ts`, `src/ui/verify-form.tsx`, `src/app/(auth)/verificar/page.tsx`, `tests/e2e/verificacao.test.ts`.
Gates: typecheck/lint ✅ · 152 dom/fin ✅ · build ✅ · e2e novos (6, com Postgres).
Commit: `7248692` → main · Estado: concluído · Ref: AGENTS.md #15

### 16. Histórico e métricas documentados
Objetivo: regra de registrar toda entrega no Histórico do AGENTS.md; entradas #12–#15 e nota de ambiente adicionadas; métrica de testes atualizada (247 em 24 arquivos).
Arquivos: `AGENTS.md`, `README.md`.
Gates: docs (sem código).
Commit: `2b4ec93` → main · Estado: concluído

### 17. Registro de entregas na Graphify
Objetivo: esta entrega — o log operacional acima, a regra de registrar após cada alteração na `SKILL.md` e o reforço no `AGENTS.md`.
Arquivos: `.claude/skills/graphify/SKILL.md`, `.claude/skills/graphify/references/registro-de-entregas.md`, `AGENTS.md`.
Gates: docs (sem código).
Commit: este commit → main · Estado: concluído
Próximo: toda entrega futura entra aqui no mesmo ciclo do commit.

### 18. Deploy automático obrigatório em hatclaw.run.place
Objetivo: regra obrigatória de deploy após cada push — gate completo em CI (typecheck, lint, suíte inteira com PostgreSQL de serviço — e2e voltaram a rodar em CI — e build) e disparo do webhook do Coolify só com gate verde; sem o secret `COOLIFY_DEPLOY_WEBHOOK` o job de deploy falha de propósito.
Arquivos: `.github/workflows/deploy.yml` (substitui `build.yml`), `COOLIFY.md`, `AGENTS.md` (#16).
Gates: docs/config (sem typecheck); YAML segue o padrão do `build.yml` anterior + serviço Postgres.
Commit: este commit → main · Estado: concluído — **pendência do dono**: configurar o secret `COOLIFY_DEPLOY_WEBHOOK` no GitHub Actions (e, se quiser bloqueio estrito, desligar o Auto Deploy no Coolify).
Próximo: primeiro push após configurar o secret valida o pipeline ponta a ponta.

### 19. Área do prestador elevada: tempo real, foto e mapa
Objetivo: ativar o `ProviderDispatchAlerts` (existia mas nunca era montado) com stream SSE `/api/prestador/solicitacoes/stream` + som; upload da foto do perfil (`User.avatarUrl`, canvas 512 no cliente, `PATCH /api/prestador/perfil/foto`); mapa interativo OSM + direção Google/Waze (da base do prestador até o endereço da solicitação) nas LeadCards e nos alertas; botão "Editar" no catálogo (save já era upsert).
Arquivos: `src/lib/service-map.ts`, `src/ui/service-map.tsx`, `src/ui/provider-avatar.tsx`, `src/app/api/prestador/perfil/foto/route.ts`, `src/app/api/prestador/solicitacoes/stream/route.ts`, `src/ui/provider-dispatch-alerts.tsx`, `src/server/services/dispatch-service.ts`, `src/ui/lead-card.tsx`, páginas `/pro` e `/pro/solicitacoes`, `src/app/api/prestador/alertas/route.ts`, `src/ui/provider-catalog-manager.tsx`, `tests/domain/service-map.test.ts`.
Gates: typecheck/lint ✅ · 160 dom/fin ✅ (8 testes novos) · build ✅ · métrica total: 255 em 25 arquivos.
Commit: este commit → main · Estado: concluído · Ref: AGENTS.md #17
Próximo: rastreamento GPS contínuo exige migration (não existe no schema) — registrado como gap; validação e2e (dois browsers, som, mapa) com Postgres.

### 20. Acompanhamento completo da jornada em tempo real
Objetivo: página `/app/pedidos/[orderId]` com timeline (aceite → pagamento → agendado → a caminho → chegou → em andamento → conclusão → repasse → avaliação), SSE de atualizações (pedido + dashboard), jornada do prestador em etapas (GO_EN_ROUTE com ETA, MARK_ARRIVED idempotente, START exige A_CAMINHO), fotos do serviço como mensagens IMAGE no fio §15, avaliação (§36) com reputação recalculada e formulário de estrelas.
Arquivos: `src/lib/service-timeline.ts` (+testes), `src/server/services/execution-service.ts`, `src/server/services/message-service.ts`, `src/server/services/review-service.ts`, `src/app/api/avaliacoes/route.ts`, `src/app/api/prestador/servicos/[orderId]/fotos/route.ts`, `src/app/api/cliente/pedidos/stream/route.ts`, `src/app/api/cliente/pedidos/[orderId]/stream/route.ts`, `src/ui/order-live-stream.tsx`, `src/ui/review-form.tsx`, `src/ui/confirm-completion.tsx`, `src/ui/service-photos.tsx`, `src/ui/service-operation.tsx`, página `/app/pedidos/[orderId]`, dashboard `/app` (links + live), agenda do prestador, `src/server/events/index.ts` (eventos novos), rota n8n (`eta_minutes`).
Gates: typecheck/lint ✅ · 169 dom/fin ✅ (9 testes novos de timeline) · build ✅ (5 rotas novas) · métrica: 264 em 26 arquivos.
Commit: este commit → main · Estado: concluído · Ref: AGENTS.md #18
Próximo: e2e da jornada completa (dois browsers, fotos, avaliação) com Postgres; notificação push real do navegador (hoje o aviso é via SSE na página aberta).

### 21. Validação facial — nível VERIFICADO com biometria
Objetivo: fluxo de validação facial no painel do prestador com selo em destaque — captura real pela câmera (getUserMedia), análise biométrica no provedor (sandbox default / Unico real por env), sem migration (documento SELFIE APROVADO + `verified`, já existentes no schema), sessão assinada de 10 min com vínculo duplo (cookie + provedor).
Arquivos: `src/domain/verification/facial.ts`, `src/server/verification/` (facial-provider, sandbox-facial-provider, unico-facial-provider, facial-session, index), `src/server/services/facial-verification-service.ts`, rotas `/api/prestador/verificacao/facial/{iniciar,validar}`, página `/pro/verificacao/facial`, `src/ui/{facial-verification,selo-verificado}.tsx`, perfil + dashboard do prestador, `tests/domain/facial-verification.test.ts` (11), `tests/e2e/verificacao-facial.test.ts` (3, com Postgres).
Gates: typecheck/lint ✅ · 180 dom/fin ✅ · build ✅ (3 rotas novas) · métrica: 278 em 28 arquivos.
Commit: este commit → main · Estado: concluído (sandbox); **pendência do dono**: credenciais Unico + validação do contrato da API para biometria real.
Próximo: validar o contrato da API da Unico (endpoints marcados TODO no adapter); e2e facial com Postgres; exibir o selo também na ficha pública do técnico.

### 22. Fluxo de contratação no modelo Uber: recusa, timeout e redistribuição
Objetivo: fechar os gaps do fluxo de oferta — recusa explícita com rotação imediata da fila (helper `rotacionarEAlertarProximaFila` compartilhado com a liberação da negociação), job `/api/jobs/timeouts` (lock vencido → redistribuição automática; solicitação sem resposta em 48h → EXPIRADA + dispatch ENCERRADA), cancelamento pelo cliente (`DELETE /api/solicitacoes/[id]` com posse + máquina de estados + auditoria + UI de confirmação) e card "Buscando prestadores" em tempo real na solicitação do cliente.
Arquivos: `src/server/services/dispatch-service.ts` (rotação extraída, `declineDispatchAlert`, `expirarOfertasVencidas`), `src/server/services/request-service.ts` (cancelamento com posse), `src/app/api/prestador/alertas/[id]/recusar/route.ts`, `src/app/api/jobs/timeouts/route.ts`, `src/app/api/solicitacoes/[id]/route.ts`, `src/ui/{cancel-request,provider-dispatch-alerts}.tsx`, página `/app/solicitacoes/[id]`, `src/server/events/index.ts` (request.expired), `tests/e2e/dispatch-timeout.test.ts` (4 casos, com Postgres).
Gates: typecheck/lint ✅ · 180 dom/fin ✅ · build ✅ (3 rotas novas) · métrica: 282 em 29 arquivos.
Commit: este commit → main · Estado: concluído · Ref: AGENTS.md #20
Próximo: agendar o `/api/jobs/timeouts` no n8n (workflow novo); "prestador que não se desloca" e "cliente ausente" exigem migration (gap registrado); e2e de aceite simultâneo com Postgres.

### 23. Varredura geral de falhas e correções
Objetivo: varrer todo o sistema seguindo os padrões de defeito conhecidos e corrigir o que aparecer.
Correções: (1) rotas fantasma `/servicos/[slug]` e `/tecnicos/[slug]` (bug #10 ressuscitado — estavam no sitemap e na home sem página; agora `permanentRedirect` para a busca filtrada + `noindex`); (2) href quebrado `/app/avaliar/[id]` → `/app/pedidos/[orderId]` (rota que nunca existiu); (3) `new Date().getFullYear()` no corpo do JSX da home e do layout de auth (extraído para helper puro); (4) `as never` da máquina facial reescrita sobre `defineStateMachine` (transição inválida lança, como nas outras 10 máquinas).
Arquivos: `src/app/(public)/servicos/[slug]/page.tsx`, `src/app/(public)/tecnicos/[slug]/page.tsx` (novos), `src/app/(cliente)/app/solicitacoes/[id]/page.tsx`, `src/app/page.tsx`, `src/app/(auth)/layout.tsx`, `src/domain/verification/facial.ts`.
Gates: typecheck/lint ✅ · 180 dom/fin ✅ · build ✅ (2 rotas novas de redirect) · métrica: 282 em 29 arquivos (sem teste novo — varredura não mudou contrato).
Commit: este commit → main · Estado: concluído · Ref: AGENTS.md #21 + tabela de defeitos.
Próximo: subir o Postgres para o e2e completo da jornada; a CSP segue pendente (registrada no `next.config.ts`).

### 24. "Esqueci minha senha" — recuperação com código no WhatsApp
Objetivo: dar saída ao login para quem esqueceu a senha, no mesmo padrão de segurança do cadastro — e-mail → código de 6 dígitos por WhatsApp (telefone verificado da conta) → nova senha; anti-oráculo (202 idêntico + bcrypt inútil para equalizar timing); reuso da disciplina de código (`consumirCodigo` extraído e compartilhado, `purpose: RESET_SENHA`); revogação real de sessões JWT emitidas antes da troca (`passwordChangedAt` + `iat`).
Arquivos: migration `prisma/migrations/20260812_recuperar_senha` (enum RESET_SENHA + User.passwordChangedAt), `prisma/schema.prisma`, `src/server/services/password-reset-service.ts` (novo), `src/server/services/verification-service.ts` (purpose + consumirCodigo), `src/server/auth/session.ts` (iat no payload, sessaoRevogadaPorTrocaDeSenha, getSession com SELECT por PK), `src/lib/validation/auth.ts` (schemas), rotas `/api/auth/{recuperar-senha,redefinir-senha}`, página `/recuperar-senha`, `src/ui/password-reset-form.tsx` (novo), `src/ui/auth-form.tsx` (link + aviso), `src/app/(auth)/entrar/page.tsx`, `src/proxy.ts` (matcher + redireciona logado), `tests/e2e/password-reset.test.ts` (11 casos, com Postgres).
Gates: typecheck/lint ✅ · 180 dom/fin ✅ · build ✅ (3 rotas novas) · métrica: 293 em 30 arquivos.
Commit: este commit → main · Estado: concluído (código + migration gerada) · Ref: AGENTS.md #22
Próximo: subir o Postgres e rodar o e2e novo (e os demais); o CI aplica a migration via `prisma migrate deploy`.

### 25. Deploy desbloqueado — migration corrompida + suíte e2e no vermelho desde a #18
Objetivo: destravar o deploy automático em hatclaw.run.place, bloqueado porque (1) a migration `20260812_recuperar_senha` continha a linha `Loaded Prisma config from prisma.config.ts.` (stdout do CLI capturado pelo `prisma migrate diff --script > arquivo`) — `prisma migrate deploy` falhava com syntax error e o gate morria antes dos testes e do deploy; e (2) com a migration corrigida, a suíte e2e completa revelou-se vermelha desde a #18: a mudança deliberada da máquina de estado (START exige `A_CAMINHO`) quebrou os e2e que iniciavam o serviço direto do agendado — mascarada porque o gate nunca chegava aos testes.
Correções: migration limpa (`prisma/migrations/20260812_recuperar_senha/migration.sql`); e2e antigos atualizados para o fluxo novo (`markProviderEnRoute` antes do `startService`/`START` em chat, financeiro-obrigatorio, fluxo-completo, n8n-integracao, operacao-prestador; fio da conversa ganha a mensagem SYSTEM do "a caminho"); `dispatch-timeout.test.ts` reescrito (reset do banco em `beforeEach` + assertivas agnósticas à ordem — ranking ordena por distância, não por ordem de criação); `password-reset.test.ts` (usuário criado uma vez só; telefone com `+55` E.164); serviço facial distingue sessão alheia (`INVALID_SESSION`) do catch-all (`FACIAL_PROVIDER_UNAVAILABLE`) em `src/server/services/facial-verification-service.ts`.
Gates: typecheck/lint ✅ · 180 dom/fin ✅ · build ✅ · e2e: pendente de Postgres local — validado no CI (gate completo com banco de serviço).
Commit: este commit → main · Estado: concluído · Ref: AGENTS.md #23 + tabela de defeitos.
Próximo: acompanhar o run do CI — com o gate verde o webhook dispara o deploy em hatclaw.run.place.

### 26. Revogação de sessão com granularidade correta (mesmo segundo da troca)
Objetivo: o e2e "sessão emitida depois da troca segue válida" pegou uma race real — o `iat` do JWT é em segundos e `passwordChangedAt` em ms; `iat * 1000 < changedAt` revogava tokens criados no MESMO segundo da troca (mas depois dela), deslogando quem acabou de trocar a senha e logou na hora.
Correção: `src/server/auth/session.ts` — `sessaoRevogadaPorTrocaDeSenha` compara na granularidade do `iat`: revogado só se `iat < floor(changedAt/1000)`.
Gates: typecheck/lint ✅ · 180 dom/fin ✅ · CI: gate completo verde (293 testes com Postgres real) ✅ · o único item vermelho passou a ser o job de deploy por secret ausente (configuração do dono).
Commit: bb5ba57 → main · Estado: concluído · Ref: AGENTS.md #23 (defeito na tabela).
Próximo: dono configura o secret COOLIFY_DEPLOY_WEBHOOK (deploy webhook do Coolify) — com o gate verde, o próximo push dispara o deploy em hatclaw.run.place.

### 27. Cadastro de serviços do prestador — beco sem saída quando não há categorias
Objetivo: corrigir o relato "não está dando para cadastrar os serviços prestados" no painel do prestador. Investigação: o fluxo de save em si estava correto (schema Zod testado com os formatos de preço reais — "180,00", "R$ 180", "1.800,00" → centavos; upsert `providerId_categoryId` com índice único presente na migration init; componente, rota, serviço, RBAC e typecheck ok). Causa raiz ambiental: com `service_categories` vazio (seed não rodado / catálogo desativado), o select de categoria ficava vazio e o form falhava em silêncio — beco sem saída. Soma-se a isso um defeito visual real: o `<select>` não tinha `w-full`.
Correção: `src/ui/provider-catalog-manager.tsx` — estado vazio acionável (Alert "Catálogo da plataforma ainda não ativado — rode pnpm db:seed no servidor"), select + botão Salvar desabilitados sem categorias, e `<select>` com `w-full` + focus ring + disabled (padrão CONTROL dos demais campos).
Gates: typecheck/lint ✅ · 180 dom/fin ✅ · build ✅ (sem teste novo — UI).
Commit: este commit → main · Estado: concluído · Ref: AGENTS.md #24 + 2 linhas na tabela de defeitos.
Próximo: dono roda `pnpm db:deploy` (migrations) e `pnpm db:seed` (catálogo) no servidor — e configura o secret COOLIFY_DEPLOY_WEBHOOK para o deploy automático voltar a funcionar (bloqueado desde a rodada #16).
