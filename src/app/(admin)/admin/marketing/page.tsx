import type { Metadata } from "next";
import { connection } from "next/server";

import { ROTULO_STATUS, tomDoStatusGeracao } from "@/lib/marketing-image";
import { estadoCredencialHiggsfield, getImagemMarketingProvider } from "@/server/marketing";
import { listarGeracoesRecentes } from "@/server/services/marketing-image-service";
import { Alert, Badge, EmptyState, Icon } from "@/ui";
import { AdminHeader } from "@/ui/admin-table";
import {
  AtualizarGeracao,
  EstudioImagemMarketing,
  LinkDaImagem,
} from "@/ui/marketing-image-studio";

export const metadata: Metadata = { title: "Estúdio de marketing" };

/**
 * Estúdio de marketing (Higgsfield Marketing Studio — GPT Image 2.5 Sunburst).
 *
 * Só o admin gera, porque cada geração gasta crédito da conta da plataforma
 * e não existe cota por usuário. O histórico abaixo é a trilha de auditoria:
 * pedido e desfecho de cada geração.
 */
export default async function AdminMarketingPage() {
  // Sempre dinâmica, e dito explicitamente: layout e página renderizam em
  // paralelo, e sem isto o prerender do build executava este corpo — o log do
  // build ganhava um "HF_KEY ausente" que nada diz sobre o servidor real.
  await connection();

  const provedor = getImagemMarketingProvider();
  const credencial = estadoCredencialHiggsfield();
  const geracoes = await listarGeracoesRecentes(12);

  return (
    <div className="flex flex-col gap-8">
      <AdminHeader
        eyebrow="Plataforma"
        titulo="Estúdio de marketing"
        descricao="Gere e edite imagens de campanha com o Marketing Studio do Higgsfield (GPT Image 2.5 Sunburst). A chave fica no servidor; cada geração gasta créditos da conta da plataforma e fica registrada na auditoria."
        acao={
          provedor.modo === "real" ? (
            <Badge tone="success">Higgsfield conectado</Badge>
          ) : (
            <Badge tone="warning">Sandbox</Badge>
          )
        }
      />

      {provedor.modo === "sandbox" && (
        <Alert
          tone="warning"
          title={credencial === "invalida" ? "HF_KEY em formato inválido" : "Modo sandbox"}
        >
          {credencial === "invalida"
            ? "A credencial configurada não está no formato KEY_ID:KEY_SECRET, então o estúdio roda em sandbox: as prévias são simuladas e nada é cobrado."
            : "Sem HF_KEY no servidor, o estúdio roda em sandbox: as prévias são simuladas e nada é cobrado. Configure HF_KEY=KEY_ID:KEY_SECRET e reinicie a aplicação para gerar de verdade."}
        </Alert>
      )}

      <EstudioImagemMarketing modo={provedor.modo} />

      <section aria-labelledby="historico-titulo">
        <h2 id="historico-titulo" className="mb-3 text-lg font-bold tracking-[-0.02em]">
          Histórico <span className="text-muted num text-sm">({geracoes.length})</span>
        </h2>

        {geracoes.length === 0 ? (
          <EmptyState
            title="Nenhuma imagem gerada ainda"
            description="As gerações aparecem aqui com o prompt, os parâmetros e o resultado."
          />
        ) : (
          <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr))]">
            {geracoes.map((geracao) => {
              const capa = geracao.imagens[0];
              return (
                <li
                  key={geracao.requestId}
                  className="surface-card flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-[var(--surface-border)]"
                >
                  <div className="aspect-square bg-[var(--surface-muted)]">
                    {capa ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={capa}
                        alt={`Imagem gerada: ${geracao.prompt.slice(0, 120)}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-[var(--text-muted)]">
                        <Icon
                          name={geracao.status ? "image-broken" : "hourglass-medium"}
                          className="text-4xl"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={tomDoStatusGeracao(geracao.status)}>
                        {geracao.status ? ROTULO_STATUS[geracao.status] : "Em andamento"}
                      </Badge>
                      {geracao.modo === "sandbox" && <Badge>Sandbox</Badge>}
                      {geracao.aprimorar && <Badge tone="brand">Preset</Badge>}
                    </div>
                    <p className="line-clamp-3 text-sm break-words">{geracao.prompt}</p>
                    <p className="text-muted num text-xs">
                      {geracao.criadaEm.toLocaleString("pt-BR")} · {geracao.proporcao} ·{" "}
                      {geracao.resolucao} · {geracao.qualidade}
                    </p>
                    {geracao.autorEmail && (
                      <p className="text-muted truncate text-xs">{geracao.autorEmail}</p>
                    )}
                    {geracao.erro && (
                      <p className="text-danger-700 text-xs break-words">{geracao.erro}</p>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      {geracao.imagens.map((url) => (
                        <LinkDaImagem key={url} url={url} requestId={geracao.requestId} />
                      ))}
                      {!geracao.status && <AtualizarGeracao requestId={geracao.requestId} />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
