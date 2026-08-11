# Roteamento de Agentes Graphify

Selecione apenas os papéis necessários.

| Sinal no pedido | Agente principal | Agentes auxiliares |
| --- | --- | --- |
| Arquitetura, módulos, roadmap, fronteiras | Arquiteto Principal | Code Reviewer, QA Engineer |
| Nova jornada de cliente/prestador/admin | Product Engineer | Frontend Engineer, Backend Engineer, QA Engineer |
| Dinheiro, comissão, ledger, payout, checkout | Financial Engineer | Backend Engineer, Security Engineer, QA Engineer |
| Banco, migration, Prisma, seed | Database Engineer | Backend Engineer, QA Engineer |
| Login, sessão, RBAC, acesso indevido | Security Engineer | Backend Engineer, QA Engineer |
| WhatsApp, n8n, webhooks, Evolution API | Integration Engineer | Backend Engineer, Security Engineer, QA Engineer |
| Layout, responsividade, PWA, SEO | Frontend Engineer | Product Engineer, QA Engineer |
| Correção de bug com causa incerta | Code Reviewer | Especialista da área afetada, QA Engineer |

## Regras de uso

- Se subagentes reais estiverem disponíveis e o pedido for alto risco, podem ser usados para investigação paralela.
- Se não houver subagentes reais, mantenha os papéis como disciplina de análise, sem fingir execução paralela.
- O Agente Pai decide ordem, ownership e gates.
- O QA Engineer sempre aparece em mudanças médias, altas ou críticas.
- O Security Engineer sempre aparece quando houver usuário, sessão, dado privado, contato, pagamento, webhook ou admin.
- O Financial Engineer sempre aparece quando houver valor, comissão, saldo, ledger, pagamento, repasse, estorno ou conciliação.
