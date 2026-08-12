import { permanentRedirect } from "next/navigation";

export const metadata = { robots: { index: false } };

/**
 * Cidade de atendimento (URL anunciada no sitemap e usada na home).
 *
 * O conteúdo de uma cidade vive na busca filtrada (`/tecnicos?cidade=`), não
 * em página própria — este redirect permanente (308) faz a URL do sitemap e
 * os links da home pararem de devolver 404 e levarem ao conteúdo real.
 */
export default async function TecnicosCidadePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/tecnicos?cidade=${encodeURIComponent(slug)}`);
}
