# Handoff Claude/Codex

Use este modelo ao final de toda alteração concreta para permitir que Codex continue de onde Claude parou, e que Claude continue de onde Codex parou.

## Onde registrar

Registre o handoff no resumo final da resposta e, quando houver commit, garanta que o commit e o push já contenham os arquivos alterados. Não crie arquivo permanente de handoff no repositório a menos que o usuário peça ou a tarefa fique intencionalmente incompleta.

Se a tarefa for interrompida, bloqueada ou parcialmente concluída, deixe o handoff em formato copiável na resposta final.

## Formato obrigatório

```markdown
**Handoff Claude/Codex**
Estado: <concluído | parcial | bloqueado>
Último objetivo: <o que estava sendo feito>
Arquivos alterados:
- `<arquivo>`: <o que mudou>
Arquivos lidos importantes:
- `<arquivo>`: <por que importa>
Decisões tomadas:
- <decisão e motivo>
Gates executados:
- `<comando>`: <passou | falhou | não rodou e motivo>
Git:
- Commit: `<sha ou não criado>`
- Push: `<destinos ou bloqueio>`
Próximo passo recomendado:
1. <ação objetiva para o próximo agente>
Cuidado especial:
- <risco, invariante ou detalhe que não pode ser perdido>
```

## Regras

- Seja específico o bastante para outro agente não precisar reconstruir o contexto do zero.
- Não registre segredo, token, senha, chave PIX, webhook secret ou dados sensíveis.
- Diferencie o que foi verificado em execução do que apenas foi inferido.
- Se houve falha, preserve o erro essencial e o comando que falhou.
- Se houver mudanças não commitadas, liste exatamente quais arquivos ficaram pendentes e por quê.
- Se a continuação exigir ambiente, informe comandos relevantes: banco, dev server, build, smoke ou layout.
