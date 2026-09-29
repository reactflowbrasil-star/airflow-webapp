# Testar o AirFlow sem o servidor

Para testar o app, inclusive o Estúdio de marketing, sem depender do servidor
de produção. Há dois caminhos: o **GitHub Codespaces**, que não exige instalar
nada, e o **próprio computador**.

## Jeito mais fácil: GitHub Codespaces

O GitHub monta o app inteiro na nuvem dele (Node, banco, dependências e contas
de teste) e abre no seu navegador. A configuração está em `.devcontainer/`.

1. Logado no GitHub, abra
   <https://codespaces.new/empurraodigital-boop/airflow-webapp?quickstart=1>
   e clique em **Create codespace**.
2. Espere a primeira montagem, que leva uns 5 minutos. Um editor abre no
   navegador e o terminal mostra o progresso. Não precisa mexer em nada.
3. Quando terminar, o app abre sozinho numa aba nova. Se o navegador bloquear
   a aba: embaixo, na aba **Portas** (Ports), passe o mouse na porta 3000
   "AirFlow" e clique no ícone de globo.
4. Entre com `admin@airflow.local` / `Demo1234` e siga em
   [Gerar imagem no Estúdio](#gerar-imagem-no-estúdio).

O endereço é privado: só abre logado na sua conta do GitHub. Não mude a porta
para **Public**, porque as contas de teste têm senha pública. O codespace
desliga sozinho depois de 30 minutos sem uso; para voltar, abra
<https://github.com/codespaces>. Contas pessoais do GitHub têm uma cota
gratuita mensal de uso.

## No próprio computador (Windows)

O passo a passo é para **Windows**; no macOS e no Linux os comandos são os
mesmos.

### 1. Instalar (uma vez)

| Programa | Onde baixar | Observação |
| --- | --- | --- |
| Node.js 24 (LTS) | <https://nodejs.org> → instalador do Windows (`.msi`) | Avançar até o fim |
| Docker Desktop | <https://www.docker.com/products/docker-desktop/> | Aceite o WSL 2 e reinicie se ele pedir. Depois abra o Docker Desktop e espere aparecer **Engine running** |
| pnpm | No Prompt de Comando: `npm install -g pnpm@11.16.0` | Depois de instalar o Node |

Use o **Prompt de Comando** (menu Iniciar → digite `cmd`). No PowerShell, o
Windows costuma bloquear o `npm` e o `pnpm` com "a execução de scripts foi
desabilitada neste sistema". Para usar o PowerShell mesmo assim, rode uma vez
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### 2. Baixar o projeto

Logado no GitHub, na página do repositório: **Code → Download ZIP**, e extraia
a pasta (em Documentos, por exemplo). Quem tem Git pode clonar:
`git clone https://github.com/empurraodigital-boop/airflow-webapp.git`.

Abra o Prompt de Comando **dentro da pasta do projeto**: no Explorador de
Arquivos, clique na barra de endereço, digite `cmd` e tecle Enter.

### 3. Subir pela primeira vez

```bat
docker compose up -d
pnpm install
pnpm local:preparar
pnpm dev
```

| Comando | O que faz |
| --- | --- |
| `docker compose up -d` | Sobe o PostgreSQL. Na primeira vez, baixa a imagem |
| `pnpm install` | Instala as dependências. Leva alguns minutos |
| `pnpm local:preparar` | Cria o `.env` com segredos sorteados, aplica as migrations e cria as contas de demonstração |
| `pnpm dev` | Liga o app. **Deixe essa janela aberta** |

Se o Windows perguntar sobre o firewall para o Node.js, pode cancelar: o
navegador do próprio computador funciona assim mesmo.

Abra <http://localhost:3000/entrar>. A primeira página demora alguns segundos,
porque é compilada na hora.

| Papel | E-mail | Senha |
| --- | --- | --- |
| Admin | `admin@airflow.local` | `Demo1234` |
| Cliente | `cliente@airflow.local` | `Demo1234` |
| Técnico | `tecnico@airflow.local` | `Demo1234` |

Essas contas só existem fora de produção: com `NODE_ENV=production`, o seed
não as cria.

### Próximas vezes

Abra o Docker Desktop e, na pasta do projeto:

```bat
docker compose up -d
pnpm dev
```

Para parar: `Ctrl + C` na janela do `pnpm dev` e depois `docker compose stop`.

### Problemas comuns

| Sintoma | O que fazer |
| --- | --- |
| `'pnpm' não é reconhecido` | Feche e abra o Prompt de Comando depois de instalar. Se continuar: `npm install -g pnpm@11.16.0` |
| `error during connect` ou `docker` não encontrado | O Docker Desktop está fechado. Abra e espere **Engine running** |
| `port is already allocated` na 5432 | Já existe um PostgreSQL no computador. Apague o `.env` se ele já foi criado, rode `set AIRFLOW_DB_PORTA=5433` e repita `docker compose up -d` e `pnpm local:preparar` na mesma janela |
| "Nenhum PostgreSQL respondeu" | O `docker compose up -d` não rodou, ou o Docker Desktop está fechado |
| Porta 3000 ocupada | `set PORT=3001`, depois `pnpm dev`, e abra <http://localhost:3001> |
| Quero começar do zero | `docker compose down -v`, apague o `.env` e refaça o passo 3 |

## Gerar imagem no Estúdio

Entre como admin → menu **Estúdio de marketing** → **Connect API key** → cole a
chave criada em <https://open.higgsfield.ai/api-keys>, como veio → escreva o
prompt → **Gerar imagem**. As chamadas saem de onde o app roda (o codespace ou
o seu computador) direto para a Higgsfield, e cada geração é cobrada na sua
conta. Detalhes em `docs/HIGGSFIELD.md`.
