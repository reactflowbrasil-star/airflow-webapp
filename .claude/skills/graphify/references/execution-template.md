# Template de Execução Graphify

Use este template quando a mudança for média, alta ou crítica.

~~~markdown
**Graphify**
Pedido: <reescreva a solicitação em uma frase objetiva>
Complexidade: <Baixa | Média | Alta | Crítica>
Risco principal: <risco mais provável ou mais caro>

Grafo:
```mermaid
graph TD
  A[Pedido] --> B[Leitura do projeto]
  B --> C[Mapa de impacto]
  C --> D[Implementação]
  D --> E[Gates]
  E --> F[Git automático]
  F --> G[Handoff Claude/Codex]
```

Ownership:
| Área | Dono | Arquivos prováveis |
| --- | --- | --- |
| Produto | Product Engineer | ... |
| Frontend | Frontend Engineer | ... |
| Backend | Backend Engineer | ... |
| Financeiro | Financial Engineer | ... |
| Segurança | Security Engineer | ... |
| QA | QA Engineer | ... |

Ordem de execução:
1. Ler `CLAUDE.md` e `AGENTS.md`.
2. Ler arquivos diretamente afetados.
3. Confirmar invariantes e contratos existentes.
4. Implementar menor fatia funcional.
5. Rodar gates compatíveis com o risco.
6. Revisar `git status --short`, `git diff --check` e diff relevante.
7. Fazer stage apenas dos arquivos do pedido.
8. Criar commit em pt-BR.
9. Fazer push para `main`.
10. Registrar handoff Claude/Codex com estado, arquivos, gates, commit, pendências e próximo passo.
11. Relatar verificações reais, pendências e commit gerado.

Gates:
- <comandos exatos>
~~~

Remova áreas que não se aplicam. Não mantenha especialistas decorativos. Não faça commit se os gates obrigatórios falharem; corrija primeiro ou relate o bloqueio. Sempre deixe handoff suficiente para Claude ou Codex continuarem sem reconstruir contexto do zero.
