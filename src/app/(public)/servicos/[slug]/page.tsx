import { permanentRedirect } from "next/navigation";

export const metadata = { robots: { index: false } };

/**
 * Categoria de serviço (URL anunciada no sitemap e usada na home).
 *
 * O conteúdo de uma categoria vive na busca filtrada (`/tecnicos?categoria=`),
 * não em página própria — este redirect permanente (308) faz a URL do sitemap
 * e os links da home pararem de devolver 404 e levarem o usuário ao conteúdo
 * real. O slug é preservado como parâmetro.
 */
export default async function ServicoCategoriaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/tecnicos?categoria=${encodeURIComponent(slug)}`);
}
