# Interfaces — handoff de design aplicado

Registro do que foi aplicado a partir do handoff `Interfaces responsivas com
Webflow` e do componente Top-Nav indicado pelo cliente, mais as decisões que
tiveram de ser tomadas no caminho.

O handoff diz, com todas as letras, que o HTML entregue é **referência de
design, não código de produção**, e que os componentes devem ser *atualizados
no lugar*. Foi o que se fez: nenhum trecho do HTML de referência foi colado no
projeto — o que existe são os componentes do design system reescritos sobre os
tokens do produto.

## Sistema visual

| Item | Valor |
| --- | --- |
| Paleta | Violeta — `brand-500 #7A5CF0`, `brand-600 #6246E0` |
| Tipografia | Plus Jakarta Sans, auto-hospedada por `next/font/google` |
| Ícones | Phosphor **duotone**, via `@import "@phosphor-icons/web/duotone"` |
| Temas | Tema único claro, fundo branco harmonioso (decisão do dono em #24) |
| Raios | `--radius-pill/hero/card/field` |

Regra de animação herdada do handoff e seguida em todos os keyframes: **anima-se
apenas `transform`, nunca `opacity` a partir de 0** — conteúdo que começa
invisível some para quem tem `prefers-reduced-motion` ou JS quebrado.

Responsividade sem media query onde dá: `repeat(auto-fit, minmax(…, 1fr))`,
`flex-wrap`, `min-width: 0` e `clamp()`.

## Telas

As 12 telas do handoff foram aplicadas. Duas observações sobre a última:

**Tela 10 (Mensagens)** exigia mais do que estilo. A tabela `Conversation`
existia no schema desde o início, mas nada escrevia nela — a tela era uma lista
que nunca teria itens. Aplicar só o visual teria produzido uma casca. O que foi
implementado, em vez disso:

- a conversa **nasce sozinha** na primeira proposta, dentro da mesma transação
  (`recordConversationEvent` em `proposal-service`);
- cada evento do ciclo entra no fio com o tipo do §15 — `PROPOSAL`,
  `COUNTER_PROPOSAL`, `VALUE_ACCEPTED`, `PAYMENT`, `SCHEDULING`,
  `SERVICE_STARTED`, `SERVICE_COMPLETED`;
- texto livre passa pela guarda de contato (abaixo) antes de ser gravado;
- o prestador ganhou `/pro/mensagens`, senão as mensagens do cliente não
  teriam para onde ir.

**Área do prestador** (tela 8) não existia e foi construída inteira.

## Guarda contra troca de contato

`src/domain/messaging/contact-guard.ts` — módulo puro, 11 testes.

A regra do produto é que a plataforma é o único canal: telefone, e-mail,
WhatsApp e perfis pessoais não podem trafegar entre as partes. Um chat de texto
livre é exatamente onde isso seria tentado.

A decisão foi **redigir, não bloquear**. Mensagem recusada some e o usuário
reescreve o número disfarçado; mensagem entregue com o trecho mascarado mostra
às duas partes que o canal é observado, sem perder o resto do que foi dito.

Cobre telefone em qualquer formatação, e-mail, domínio, URL, menção a canal
externo, `@perfil` e dígitos escritos por extenso. Preserva o que é legítimo:
valores em reais, BTUs, datas e horas.

O `AuditLog` registra **apenas os rótulos** dos padrões acionados. Gravar o
trecho suprimido derrotaria o propósito e vazaria o dado para os logs.

## Top-Nav

O componente indicado (`framer.com/m/Top-Nav-npC8Y8.js`) **não pôde ser
importado**. Motivos, em ordem de peso:

1. depende do runtime `framer` (`addPropertyControls`, `ControlType`), que não
   é uma dependência React comum e não roda em RSC;
2. busca outros **quatro módulos em `framerusercontent.com` em tempo de
   execução** — um terceiro no carregamento de toda página, e o PWA offline
   deixaria de funcionar;
3. tem cor fixa escura (`rgb(23,23,23)`), o que ignoraria o tema claro
   (hoje único).

O **desenho** foi extraído do módulo e reimplementado em `src/ui/top-nav.tsx`
sobre os tokens do projeto:

| Propriedade | Origem no módulo | Implementação |
| --- | --- | --- |
| Vidro | `backdrop-filter: blur(10px)` | `.surface-glass` |
| Fundo | gradiente 180° translúcido | `--glass-grad`, um por tema |
| Borda | 1px sólida | `--glass-border` |
| Raio fechado | 100px | `rounded-[100px]` |
| Raio expandido | 30px | `rounded-[30px]`, com transição |
| Largura | 95–97% centrada | `max-w-6xl` com respiro lateral |

O que o módulo não tinha e foi acrescentado: menu mobile funcional (o
cabeçalho anterior simplesmente escondia os links abaixo de `md`), rota ativa
destacada, fechamento por `Esc` e `aria-expanded`/`aria-controls`.

`TopNav` é componente de cliente por causa do menu, mas **não lê a sessão** —
`cookies()` tornaria dinâmica toda página que o usa, inclusive a homepage e os
perfis de técnico, que são as peças de SEO do produto. Verificado no build: `/`
segue estática.

## Páginas que faltavam

O cabeçalho e o `sitemap.ts` apontavam para `/servicos` e `/seja-prestador`
desde o começo — e **as duas rotas retornavam 404**. O smoke pegou isso ao
verificar respostas HTTP. Ambas foram construídas.

Em `/seja-prestador`, o exemplo de repasse é calculado a partir da regra de
comissão vigente, e não escrito à mão: se um admin mudar a comissão global, a
página passaria a prometer um valor que o produto não entrega.

## Gates

Rodados no fim, todos verdes:

```
tsc --noEmit          limpo
eslint                limpo
next build            41 páginas
vitest                140 testes, 10 arquivos
smoke (browser real)  19 verificações
check:layout          44 combinações de página × viewport
```

O smoke inclui a jornada completa do cliente e três verificações novas do
chat, entre elas a de que um telefone digitado na conversa **não aparece no
fio** — a checagem é feita no DOM renderizado, não no valor de retorno da API.
