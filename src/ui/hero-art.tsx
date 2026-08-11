import { Icon } from "@/ui";

/**
 * Arte do hero.
 *
 * O handoff prevê um recorte PNG de um técnico instalando ar-condicionado,
 * não incluído no pacote. Em vez de um retângulo cinza de placeholder, o
 * slot é uma composição própria com o halo do gradiente e os dois cards
 * flutuantes especificados — quando a foto chegar, basta trocar o miolo por
 * <Image> mantendo halo e cards.
 */
export function HeroArt() {
  return (
    <div className="relative mx-auto w-full max-w-[460px] min-w-0">
      {/* Halo do gradiente atrás da arte */}
      <div
        aria-hidden="true"
        className="bg-grad absolute inset-6 rounded-full opacity-[0.16] blur-[6px]"
        style={{ animation: "aurora 28s ease-in-out infinite" }}
      />

      <div className="anim-drift relative">
        <div className="surface-card grid aspect-[4/3.4] place-items-center rounded-[26px] shadow-(--shadow-float)">
          <div className="text-center">
            <span className="text-[var(--accent-text)] text-6xl">
              <Icon name="wrench" />
            </span>
            <p className="text-muted mt-3 px-8 text-xs leading-relaxed">
              Espaço reservado para a foto do técnico em atendimento
            </p>
          </div>
        </div>

        {/* Card flutuante — canto superior direito */}
        <div className="surface-card absolute -top-3 -right-2 rounded-[16px] px-3.5 py-2.5 shadow-(--shadow-float) sm:-right-6">
          <p className="eyebrow">Valor combinado</p>
          <p className="num mt-1 text-[0.9375rem] font-extrabold text-[var(--accent-text)]">
            R$ 280,00
          </p>
        </div>

        {/* Card flutuante — canto inferior esquerdo */}
        <div className="surface-card absolute -bottom-4 -left-2 flex items-center gap-2.5 rounded-[16px] px-3.5 py-2.5 shadow-(--shadow-float) sm:-left-6">
          <span className="bg-[var(--ok-soft)] text-[var(--ok-text)] flex h-8 w-8 items-center justify-center rounded-full">
            <Icon name="map-pin" />
          </span>
          <div>
            <p className="text-[0.8125rem] font-semibold">Técnico a caminho</p>
            <p className="num text-muted text-xs">12 min</p>
          </div>
        </div>
      </div>
    </div>
  );
}
