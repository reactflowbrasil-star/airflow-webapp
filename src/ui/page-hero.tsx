import type { ReactNode } from "react";

/**
 * Hero das páginas internas públicas, no padrão da landing
 * (Figma “AirFlow — Landing Page”, frame Desktop / 1440).
 *
 * Mesmo vocabulário da home: fundo lavanda claro, blob roxo orgânico à direita
 * no desktop, glow `#EFE8FF` no mobile, eyebrow, título escuro `#130B38` com
 * destaque violeta opcional e subtítulo. O slot `children` recebe a ação da
 * página (busca, CTAs); `lado` recebe a arte à direita quando a página tem uma.
 */

export function PageHero({
  eyebrow,
  titulo,
  destaque,
  subtitulo,
  children,
  lado,
}: {
  eyebrow: string;
  titulo: string;
  /** Trecho do título em violeta (opcional). */
  destaque?: string;
  subtitulo?: string;
  children?: ReactNode;
  lado?: ReactNode;
}) {
  return (
    <section className="anim-rise relative overflow-hidden">
      {/* Blob roxo orgânico do handoff — cobre o lado direito no desktop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 top-0 hidden h-[680px] w-[760px] lg:block"
        style={{
          background: "linear-gradient(155deg,#8B6CF7 0%,#6F42F5 55%,#4B2ACF 100%)",
          borderRadius: "46% 0 0 54% / 42% 0 0 58%",
        }}
      />
      {/* Forma lavanda clara atrás da arte (vector #A88BFF do handoff) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[10%] right-[6%] hidden h-[430px] w-[380px] lg:block"
        style={{
          background: "#A88BFF",
          opacity: 0.5,
          borderRadius: "40% 60% 60% 40% / 50% 40% 60% 50%",
        }}
      />
      {/* Glow do hero no mobile (frame Mobile / Hero) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full lg:hidden"
        style={{ background: "#EFE8FF", filter: "blur(52px)" }}
      />

      <div
        className={`relative grid items-center gap-10 ${
          lado ? "lg:grid-cols-[1.05fr_0.95fr] lg:gap-12" : "max-w-[620px]"
        }`}
      >
        <div className="min-w-0">
          <p className="eyebrow text-[var(--accent-text)]">{eyebrow}</p>
          <h1
            className="mt-2.5 text-[clamp(30px,4.4vw,46px)] leading-[1.03] font-bold tracking-[-0.045em] text-balance"
            style={{ color: "#130B38" }}
          >
            {titulo}
            {destaque && (
              <>
                {" "}
                <span className="text-[var(--accent-text)]">{destaque}</span>
              </>
            )}
          </h1>
          {subtitulo && (
            <p className="text-secondary mt-4 max-w-[560px] leading-relaxed text-pretty">
              {subtitulo}
            </p>
          )}
          {children && <div className="mt-7">{children}</div>}
        </div>

        {lado && <div className="relative min-w-0">{lado}</div>}
      </div>
    </section>
  );
}
