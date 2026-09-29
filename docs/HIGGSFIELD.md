# Higgsfield — Estúdio de marketing e SDK

Geração de imagem e vídeo pela [Higgsfield](https://open.higgsfield.ai) em
duas frentes:

| Frente | Onde | Para quê |
| --- | --- | --- |
| **Estúdio de marketing** | `/admin/estudio` (só ADMIN) | O dono da plataforma gera imagens e vídeos de campanha com a própria chave, com histórico, cancelamento e referências |
| **Exemplo do SDK oficial** | `scripts/higgsfield/index.ts` → `pnpm higgsfield:exemplo` | Setup mínimo do `@higgsfield/client` com `subscribe` (Seedance 2.5 text-to-video; `imagem` = Sunburst) |

Cada geração é **cobrada** na conta Higgsfield dona da chave usada.

## Modelos

| Modelo (caminho na API) | Superfície | Parâmetros aceitos | Fonte do contrato |
| --- | --- | --- | --- |
| `marketing-studio/image/sunburst` — Marketing Studio Image (GPT Image 2.5 Sunburst) | Imagem | `prompt` (1–5000), `quality` (low/medium/high/xhigh/max), `resolution` (1k/2k/4k), `aspect_ratio` (auto, 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9), `moderation` (auto/low), `image_urls` (0–16, edição), `enhance_prompt` + `preset_id` (preset exige 1–2 imagens) | Documentação do modelo (Input JSON Schema) entregue pelo dono |
| `bytedance/seedance-2.5/text-to-video` — Seedance 2.5 | Vídeo | `prompt`, `duration` (4–30 s), `resolution` (480p/720p), `aspect_ratio` (16:9, 4:3, 1:1, 3:4, 9:16, 21:9), `generate_audio`, `bitrate_mode` (standard/high) | Template oficial `higgsfield-ai/app-templates` (`generation/catalog/models/seedance-2.5.ts`, commit `9288d98`) + parâmetros do pedido de setup |

Os schemas vivem em `src/domain/estudio/entradas.ts` (com `additionalProperties:
false` do Sunburst) e são aplicados no servidor antes de qualquer chamada. A
API continua sendo a palavra final: uma recusa dela aparece no feed com o
motivo.

## Credenciais

| Fluxo | Onde fica | Formato | Quem lê |
| --- | --- | --- | --- |
| Estúdio — **Connect API key** | Cookie `airflow_hf_key`: httpOnly, **cifrado** (JWE `dir`/A256GCM, chave derivada do `AUTH_SECRET` por HKDF), amarrado ao admin (`sub`), 30 dias | A chave inteira, **como copiada** de open.higgsfield.ai — com ou sem `:` | Só o servidor, em `Authorization: Key <chave>` |
| Exemplo do SDK | `HF_CREDENTIALS` no `.env.local` (ignorado pelo Git) ou no ambiente | `key-id:key-secret` (o SDK exige exatamente um `:`) | O SDK |
| Base da API | `HF_API_BASE_URL` | Vazio = `https://api.higgsfield.ai` | Servidor e exemplo |

Regras:

- Nunca `NEXT_PUBLIC_`, nunca em commit, log ou chat. A rota do Estúdio nunca
  devolve a chave — nem mascarada; a página só recebe o booleano "tem chave".
- O Estúdio **não** usa `HF_CREDENTIALS`: cada admin conecta a própria chave.
  Rodar o Estúdio numa chave compartilhada do servidor é uma adaptação que
  precisa de pedido explícito do dono.
- **`.env.local` sem acentos.** Um comentário com acento nele quebra o
  `next build` (Next 16.3 + Turbopack + `next/font/google`, erro "queries have
  exactly one entry") — ver AGENTS.md, Defeitos.
- Logout (`/api/auth/sair`) apaga o cookie da chave junto com a sessão.
- Conectar e remover a chave entram no `AuditLog` (o fato, nunca o valor).

## Arquitetura

```
navegador ──► /api/admin/estudio/*  (requireAdmin + checagem de Origin + no-store)
                 │
                 ▼
          estudio-service  ── Prisma: media_generations (dono + request_id)
                 │             máquina de estado GeracaoMidia
                 ▼
          src/server/higgsfield/cliente.ts  ──►  api.higgsfield.ai
```

| Rota | O que faz |
| --- | --- |
| `POST/DELETE /api/admin/estudio/chave` | Connect/Replace API key e Remove API key |
| `POST /api/admin/estudio/geracoes` | Submete (`idempotencyKey` obrigatório) |
| `GET /api/admin/estudio/geracoes/[id]` | Status (o poll do navegador passa aqui, nunca direto na API) |
| `POST /api/admin/estudio/geracoes/[id]/cancelar` | `POST /requests/{id}/cancel` na Higgsfield |
| `POST /api/admin/estudio/upload` | Pede a URL assinada de upload (`/files/generate-upload-url`) |
| `GET /api/admin/estudio/presets` | Presets vivos do Marketing Studio, paginados por `cursor` |

Geração de outro admin responde **404** (posse filtrada na própria consulta).

### Referências (upload assinado)

1. O navegador pede o upload à nossa rota, com o `content_type`.
2. O servidor chama `/files/generate-upload-url` com a chave do admin e
   **valida** o ticket: URLs https sem usuário/senha, `upload_headers` sem
   `Authorization`/`Cookie`, `Content-Type` batendo com o pedido.
3. O navegador faz `PUT` direto no storage com os headers devolvidos e
   `credentials: "omit"` — o storage nunca recebe a chave nem cookies.
4. A `public_url` só entra em `image_urls` depois do `PUT` confirmado. A URL
   assinada é credencial de escrita: não vai para log e a resposta é `no-store`.

## Falhas, duplicidade e cancelamento

| Estado local | Significado |
| --- | --- |
| `ENVIANDO` | Linha criada, POST em voo |
| `NA_FILA` / `PROCESSANDO` | `queued` / `in_progress` na Higgsfield |
| `CONCLUIDA` | `completed` — URLs https gravadas |
| `FALHOU` / `BLOQUEADA` / `CANCELADA` | `failed` / `nsfw` / `canceled` — ficam visíveis no feed |
| `RECUSADA` | A API recusou o envio (4xx): nada foi criado lá |
| `INDETERMINADA` | Timeout, queda ou 5xx **depois** de enviar: pode existir lá. Nunca é reenviada — a tela manda conferir o histórico antes de gerar de novo |

- **Um POST cobrado por intenção.** O navegador gera um `idempotencyKey` por
  intenção; o banco tem `unique(userId, idempotencyKey)`. Clique duplo e
  requisições simultâneas viram uma geração só (teste de integração com
  `Promise.all`). Se o *nosso* servidor responder 5xx ou a rede cair, o
  próximo clique reaproveita a mesma chave.
- **Sem retry cego.** O adapter REST não reenvia; o exemplo do SDK usa
  `maxRetries: 0` (o padrão do SDK reenvia o POST em ECONNRESET/ETIMEDOUT/5xx).
- **Poll com backoff**: 4 s × 1,5 até 20 s por geração, cada uma no próprio
  ritmo; 429 respeita `Retry-After`; para em 15 min (imagem) / 30 min (vídeo)
  e o cartão oferece "Verificar agora". Parar de consultar não cancela nada.
- **Cancelamento** só em `NA_FILA` (a Higgsfield não interrompe geração em
  andamento); a confirmação vem pelo status.
- **Chave recusada (401)** abre o "Replace API key" com o aviso.
- Envio preso em `ENVIANDO` por mais de 2 min (processo caiu com o POST em
  voo) vira `INDETERMINADA` na próxima leitura.

## SDK oficial (`@higgsfield/client` 0.2.6) — achados no código do pacote

A documentação pública não pôde ser lida do ambiente da entrega (proxy de
rede), então o contrato do SDK foi lido no próprio pacote publicado:

- `subscribe` devolve o JSON cru da API (`status`, `request_id`, `images`,
  `video`) — o README ainda descreve um `JobSet`.
- O polling interno só para em `completed`/`failed`/`nsfw`: **`canceled` não é
  terminal**; um pedido cancelado vira `TimeoutError` depois de `maxPollTime`.
- O POST é reenviado sozinho em ECONNRESET/ETIMEDOUT/5xx (`maxRetries: 3`).
- **Todo 403 vira `NotEnoughCreditsError`** — inclusive um proxy de rede
  recusando o host.
- O `AxiosError` de falha de rede é relançado cru e carrega
  `config.headers.Authorization`: imprimir o erro inteiro vaza a chave. O
  exemplo só imprime mensagens traduzidas.

## Como testar

**Exemplo do SDK (cobra uma geração):**

```bash
# .env.local — SEM acentos neste arquivo
HF_CREDENTIALS=<key-id>:<key-secret>

pnpm higgsfield:exemplo                    # vídeo: Seedance 2.5, 5 s, 720p, 16:9
pnpm higgsfield:exemplo imagem             # imagem: Sunburst
pnpm higgsfield:exemplo imagem "um prompt"
```

Sai com código 0 e imprime a URL só em `completed` com mídia; `failed`,
`nsfw`, `canceled`, timeout e erros HTTP saem com código 1 e a razão.

**Estúdio:** `pnpm dev`, entrar como ADMIN, `/admin/estudio`, **Connect API
key**, colar a chave como copiada.

**Claude Code na nuvem:** o proxy de rede do ambiente precisa liberar
`api.higgsfield.ai` (Network access nas configurações do ambiente) e a chave
entra como variável `HF_CREDENTIALS` do ambiente — vale a partir da próxima
sessão. Nunca cole a chave no chat.

## O que foi e o que não foi verificado

Verificado em execução (ambiente sem acesso à API real):

- Exemplo do SDK contra um mock local do contrato: sucesso de vídeo e imagem,
  `failed`, `nsfw`, `completed` sem URL, 401, 403, 422, 429 e 500 — com
  exatamente um POST no 500 e a credencial ausente de toda saída.
- Estúdio num browser real contra o mock: 35 verificações (Connect/Manage/
  Replace/Remove, cookie httpOnly cifrado, clique duplo = 1 POST, upload
  assinado sem credencial no PUT, presets paginados, recusa visível, vídeo,
  cancelamento chegando à API, 404 de posse, Origin cruzada recusada, mobile
  sem rolagem horizontal, zero erro de console).
- 66 testes novos (domínio, adapter, credencial e integração com PostgreSQL).

**Não verificado:** nenhuma chamada chegou à API real da Higgsfield — o proxy
do ambiente recusou `api.higgsfield.ai`, `docs.`, `console.` e
`open.higgsfield.ai`. Ficam pendentes de execução real: a geração do exemplo
(etapa de verificação do setup), o CORS do storage assinado para o `PUT` do
navegador, os campos reais dos presets além de `id`/`name`/`type` e o acesso
da conta a cada modelo. **Webhooks não foram implementados:** o SDK só
acrescenta `?hf_webhook=<url>` e o esquema de assinatura da entrega não
estava na documentação disponível — sem verificação de assinatura, um webhook
seria uma porta aberta para marcar geração como concluída.
