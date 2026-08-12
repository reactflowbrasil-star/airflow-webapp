import {
  googleMapsDirectionsUrl,
  googleMapsSearchUrl,
  osmEmbedUrl,
  paraCoordenadas,
  wazeNavigationUrl,
} from "@/lib/service-map";

/**
 * Mapa interativo da solicitação + navegação guiada até o cliente.
 *
 * Sem biblioteca de mapas: o OSM entra como iframe de embed (sem chave) e os
 * botões abrem a navegação no Google Maps ou Waze — da base do prestador
 * (origem) até as coordenadas do endereço do cliente (destino). Quando a
 * solicitação não tem coordenadas, cai na busca por endereço texto.
 *
 * Componente sem hooks: pode ser renderizado tanto em Server Component
 * quanto dentro de componentes client (LeadCard, alertas).
 */

export interface ServiceMapProps {
  latitude: number | null;
  longitude: number | null;
  /** Texto do endereço (bairro, cidade) — rótulo e fallback de busca. */
  endereco: string;
  /** Base do prestador — origem da direção guiada. Opcional. */
  origem?: { latitude: number | null; longitude: number | null };
}

export function ServiceMap({ latitude, longitude, endereco, origem }: ServiceMapProps) {
  const destino = paraCoordenadas(latitude, longitude);
  const origemCoords =
    paraCoordenadas(origem?.latitude, origem?.longitude) ?? undefined;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">Localização do cliente</p>
        <span className="text-muted max-w-[60%] truncate text-xs">{endereco}</span>
      </div>

      {destino ? (
        <iframe
          title={`Mapa — ${endereco}`}
          src={osmEmbedUrl(destino)}
          className="mt-2 h-52 w-full rounded-(--radius-field) border border-[var(--surface-border)] bg-[var(--surface)]"
          loading="lazy"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <p className="text-muted mt-2 text-xs">
          O cliente não informou coordenadas — a navegação abre pela busca do
          endereço.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
        {destino && (
          <a
            href={googleMapsDirectionsUrl(destino, origemCoords)}
            target="_blank"
            rel="noreferrer"
            className="accent-soft rounded-(--radius-field) px-3.5 py-2 text-xs font-semibold text-[var(--accent-text)] transition-colors hover:border-[var(--accent)]"
          >
            Direção no Google Maps →
          </a>
        )}
        {destino && (
          <a
            href={wazeNavigationUrl(destino)}
            target="_blank"
            rel="noreferrer"
            className="accent-soft rounded-(--radius-field) px-3.5 py-2 text-xs font-semibold text-[var(--accent-text)] transition-colors hover:border-[var(--accent)]"
          >
            Navegar no Waze
          </a>
        )}
        <a
          href={googleMapsSearchUrl(endereco)}
          target="_blank"
          rel="noreferrer"
          className="text-muted hover:text-[var(--accent-text)] px-3.5 py-2 text-xs font-medium"
        >
          Ver endereço no mapa
        </a>
      </div>
    </div>
  );
}
