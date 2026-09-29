# Painel administrativo e verificação por WhatsApp

## Painel administrativo

Área `/admin`, acessível só a contas com papel `ADMIN`. A autorização é
verificada **no servidor**, no layout da área (`requireAdmin`); o `proxy.ts`
apenas redireciona quem não tem o papel, e isso é conveniência de navegação,
não controle de acesso.

### Conta do operador

`studioreactfly@gmail.com` é criada pelo seed com papel `ADMIN`. Duas
particularidades deliberadas:

- O `update` do upsert **promove a ADMIN mesmo se a conta já existir** — se a
  pessoa se cadastrar pelo site antes de o seed rodar, ainda assim recebe o
  papel.
- A senha só é definida na **criação**. Rodar o seed de novo não sobrescreve a
  senha que o operador já trocou.

Defina `ADMIN_INITIAL_PASSWORD` no ambiente antes do primeiro seed (mínimo 12
caracteres; o seed recusa menos).

Sem ela, o seed **sorteia** uma senha de 24 caracteres e a imprime **uma vez**
no log — anote dali. Não existe senha padrão fixa no código: um literal no
repositório seria credencial conhecida em todo deploy que esquecesse a
variável, e o repositório é o primeiro lugar onde alguém procura.

### Seções

| Seção | O que faz | Age? |
| --- | --- | --- |
| Visão geral | Pendências que exigem decisão + retrato financeiro | — |
| Aprovar técnicos | Fila de análise com documentos e dados fiscais | aprovar, rejeitar, suspender, reativar |
| Usuários | Busca por nome/e-mail, filtro por papel | suspender, reativar |
| Pedidos | Ordens com bruto, comissão congelada e líquido | leitura |
| Disputas | Mediação com evidências das duas partes | reembolsar, liberar ao técnico |
| Avaliações | Notas ligadas a ordens concluídas | leitura |
| Ledger | Partidas dobradas e saldo por conta | leitura |
| Repasses | Fila de saques com chave PIX mascarada | processar, concluir, falhar |
| Comissões | Regras vigentes e criação de versão nova | criar, desativar |
| Catálogo | Categorias e cidades | ativar, desativar |
| Estúdio de marketing | Imagens de campanha no Higgsfield (GPT Image 2.5 Sunburst) + histórico | gerar, editar, aplicar preset |
| Eventos n8n | Outbox, incluindo dead-letter | reenfileirar |
| Auditoria | Trilha append-only de quem fez o quê | leitura |

### Regras que o painel não quebra

1. **Toda ação exige motivo** e grava em `AuditLog` com autor, valor anterior e
   valor novo. Ação de admin sem rastro é indistinguível de invasão.
2. **Toda transição passa pela máquina de estado.** Ser admin não permite levar
   um prestador de `BLOQUEADO` a `APROVADO` por atalho. Quando a máquina
   recusa, a transação inteira reverte — nem o log de auditoria fica.
3. **O ledger é imutável.** Não existe tela para editar lançamento. Correção é
   lançamento compensatório, feito pelos serviços financeiros.
4. **Regra de comissão não é editada no lugar.** Snapshots congelados apontam
   para ela e precisam continuar legíveis; desativar cria o fim da vigência,
   não apaga a linha.
5. **O admin não age sobre a própria conta** — seria a forma mais fácil de
   deixar a plataforma sem operador.
6. **Ações financeiras delegam aos serviços de domínio** (`resolveDispute`,
   `processPayout`, `completePayout`, `failPayout`). A rota HTTP não move
   saldo por conta própria.

Cobertura: `tests/e2e/admin.test.ts`, 13 testes.

### Estúdio de marketing (Higgsfield)

`/admin/marketing` gera e edita imagens de campanha com o Marketing Studio
Image do Higgsfield (modelo `marketing-studio/image/sunburst`, GPT Image 2.5
Sunburst). São três modos: criar do zero, editar a partir de links de imagem
(até 16) e aplicar um preset do Marketing Studio (imagem do produto e,
opcionalmente, a do modelo). O catálogo de presets é consultado ao vivo, porque
o provedor gerencia os presets num CMS e proíbe fixar os ids.

- **A chave fica no servidor.** `HF_KEY` (ou `HF_CREDENTIALS`), no formato
  `KEY_ID:KEY_SECRET`. Sem ela, ou fora do formato, o estúdio roda em
  **sandbox**: prévia SVG simulada, nada cobrado, e a tela avisa. Trocar a
  chave exige reiniciar a aplicação.
- **Só o admin gera.** Cada geração gasta crédito da conta da plataforma, e não
  existe cota por usuário. Há limite de 20 gerações a cada 10 minutos por
  operador, contra clique repetido e script em loop.
- **Toda geração fica na auditoria**: `MARKETING_IMAGE_REQUESTED` guarda autor,
  prompt e parâmetros; `MARKETING_IMAGE_COMPLETED`/`_FAILED`, o desfecho. O
  histórico da página é essa trilha, sem tabela nova. De link de referência,
  a auditoria guarda **só o host**, porque link assinado leva credencial na
  query string.
- **Só se acompanha geração que nasceu aqui.** O id vem da URL e vira path na
  API do provedor: fora do formato UUID, ou sem o registro de pedido na
  auditoria, a resposta é 404. Pedido feito no sandbox não é "concluído"
  depois que o servidor passa a usar o Higgsfield, e vice-versa.
- **Sem retentativa automática do POST.** O pedido é cobrado; repetir um cuja
  resposta se perdeu pode cobrar duas vezes. Quem repete é o operador.
- **Moderação no padrão do provedor** (`auto`). O contrato aceita `low`, mas o
  estúdio produz peça de marca e não oferece essa opção.
- A geração é assíncrona: a tela consulta o estado a cada 2,5 s, por até
  5 minutos (o mesmo teto do SDK). Se o operador sair antes, o card do
  histórico ganha o botão "Atualizar status".

Contrato conferido no SDK oficial `@higgsfield/client` 0.2.6, baixado do
registro npm, porque a documentação em `docs.higgsfield.ai` não era alcançável
do ambiente de desenvolvimento: `POST /marketing-studio/image/sunburst`,
`GET /requests/{id}/status`, `GET /marketing-studio/image/presets` e header
`Authorization: Key KEY_ID:KEY_SECRET`. O SDK não virou dependência; o adapter
usa `fetch`, como os de Evolution e Google.

Cobertura: `tests/domain/marketing-imagem.test.ts` (44, adapter com `fetch`
falso) e `tests/e2e/marketing-imagem.test.ts` (7, com PostgreSQL).

## Verificação de cadastro por WhatsApp

O telefone passou a ser **obrigatório** no cadastro. A conta nasce em
`PENDING_VERIFICATION` e só vira `ACTIVE` depois que o código chega e é
confirmado.

```
cadastro → conta PENDING_VERIFICATION + código enviado
        → /verificar (6 dígitos)
        → confirmação → ACTIVE → área do cliente
```

Quem não confirmou é redirecionado para `/verificar` ao tentar entrar em
`/app` ou `/pro`. A própria tela de verificação exige sessão mas **não** exige
verificação — senão o usuário ficaria trancado fora do único lugar onde pode
se desbloquear.

### O código é tratado como credencial

- **bcrypt em repouso.** O banco guarda o hash; o código em claro só existe no
  instante do envio.
- **Nunca em log**, nem no de desenvolvimento. O sandbox registra que enviaria,
  mascarando até o telefone. Log de desenvolvimento vira log de produção com
  uma variável de ambiente errada.
- **Uso único**, com consumo condicional na transação: duas requisições
  simultâneas com o código certo, só a primeira ativa a conta.
- **TTL de 10 minutos**, 5 tentativas, 60 s entre reenvios e teto de 5 códigos
  por hora por número.
- **Mesma mensagem** para código errado, expirado e inexistente — a tela não
  pode virar um oráculo de "este telefone tem cadastro".
- A auditoria registra que houve verificação, **nunca o código**.

Cobertura: `tests/e2e/verificacao.test.ts` (14 testes) e
`tests/domain/phone.test.ts` (6 testes).

### Evolution API

O envio vai pela instância indicada pelo cliente. O contrato foi **verificado
no manager da própria instância**, não presumido da documentação de outra
versão — a linha GO difere da v1/v2 em Node:

```
POST {EVOLUTION_API_URL}/send/text
apikey: {EVOLUTION_API_KEY}
{ "number": "5511988771200", "text": "..." }
```

O número vai só em dígitos: a Evolution monta o JID a partir disso, e o `+` do
E.164 faria o destino não resolver.

**Credenciais necessárias** (nenhuma está no repositório):

| Variável | Onde obter |
| --- | --- |
| `EVOLUTION_API_URL` | `https://evolution.hatclaw.run.place` |
| `EVOLUTION_API_KEY` | Token da instância, no manager |

Sem as duas, o provedor cai no **sandbox**: o cadastro continua funcionando, o
código é gerado e gravado, mas nada é entregue — e o log avisa em nível de
warning. É o que permite desenvolver sem credencial sem fingir que o envio
aconteceu.

### Normalização de telefone

`src/domain/identity/phone.ts`, módulo puro. `(11) 98877-1200`,
`11988771200`, `+55 11 98877 1200` e `5511988771200` viram todos
`+5511988771200`. Sem isso, `phone @unique` não impediria a mesma pessoa de
criar duas contas.

Só aceita celular brasileiro: WhatsApp não entrega em fixo, e aceitar um número
que nunca receberá o código só produziria cadastros travados.
