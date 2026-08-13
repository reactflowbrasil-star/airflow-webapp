# CLAUDE.md

@AGENTS.md

O manual completo — arquitetura, invariantes, comandos, histórico e a lista de
defeitos já corrigidos — está em `AGENTS.md`, importado acima. Mantido num
arquivo só porque dois documentos com o mesmo conteúdo divergem na primeira
alteração que alguém esquece de replicar.

Abaixo, só o que é específico do Claude Code.

## Regra obrigatória do projeto

A skill `/graphify` é o padrão obrigatório para qualquer modificação no projeto.
Antes de alterar código, documentação, configuração, workflows, banco ou UI:

1. invoque ou aplique mentalmente `/graphify`;
2. leia `CLAUDE.md`, `AGENTS.md` e os arquivos afetados;
3. classifique risco, ownership, ordem de execução e gates;
4. implemente em etapas pequenas;
5. rode os gates compatíveis;
6. faça Git automático quando os gates permitirem;
7. registre handoff Claude/Codex para continuidade.

Se o uso revelar uma lacuna na própria `/graphify`, melhore a skill no mesmo
ciclo ou registre exatamente o ajuste necessário no handoff.

## Antes de qualquer coisa

**Responda e escreva em português do Brasil.** Inclusive commits, comentários e
mensagens de erro.

## Ao começar uma sessão

O PostgreSQL deste ambiente cai entre sessões. Se for mexer em algo que toca o
banco:

```bash
pg_isready || pg_ctlcluster 16 main start
```

## Antes de dizer que terminou

```bash
pnpm gates    # typecheck + lint + testes + build
```

E, quando a mudança afeta tela ou fluxo, rode também o que só pega defeito em
execução real:

```bash
pnpm start -p 3100 &   # precisa de build recente
pnpm smoke             # 21 verificações num browser de verdade
pnpm check:layout      # rolagem horizontal em 4 viewports
```

Vale insistir: **vários defeitos deste projeto passaram por `tsc` e `eslint`
intactos** e só apareceram no browser — arity de route handler, função passada
de Server para Client Component, `includes("")` sempre verdadeiro. Gate estático
verde não é entrega verificada.

## Git

Commit e push vão direto para a **`main`** — decisão do dono do projeto, tomada
depois de o PR #1 ser fechado:

```bash
git push -u origin HEAD:main
```

Nunca use `pkill -f "next start"` para liberar a porta: o padrão casa com o
próprio shell que executa o comando e mata a sessão. Use `fuser -k 3100/tcp`.

Cuidado com `pnpm build | head` — o `SIGPIPE` interrompe o build no meio e
deixa `.next` incompleto, o que se manifesta depois como página sem CSS.
Redirecione para arquivo e leia depois.

## Ferramentas

- `Edit`/`Write` para código. Scripts Python em lote são úteis para renomear em
  vários arquivos, mas `replace` cego já fechou `<div>` legítimo com `</>` neste
  repositório — confira o resultado.
- Screenshots com Playwright em `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
  `args: ["--no-sandbox"]`. Não rode `playwright install`.
- Scripts temporários em `scripts/.nome.mts` (o ponto os mantém fora do lint por
  convenção deste repositório) e **apague antes de commitar**.

## Honestidade

O §65 do CORE-PROMPT exige gates honestos. Na prática:

- Não diga que um teste passou sem tê-lo rodado.
- Se uma capacidade não existe no ambiente, diga isso — não simule a seção.
- Ao relatar, separe o que foi **verificado em execução** do que só compilou.
