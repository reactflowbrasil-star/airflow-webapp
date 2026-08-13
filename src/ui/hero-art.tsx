import { Icon } from "@/ui";

/**
 * Arte do hero (handoff "AirFlow — Landing Page", frame Painel / Técnico).
 *
 * O handoff prevê um recorte PNG de um técnico instalando ar-condicionado,
 * não incluído no pacote. Em vez de um retângulo cinza de placeholder, o slot
 * é um círculo lavanda com o ícone de busca — quando a foto chegar, basta
 * trocar o miolo por <Image> mantendo o círculo, os cards flutuantes e a
 * prova social de avatares.
 */

const AVATARES = [
  { inicial: "M", cor: "#F3C5B5" },
  { inicial: "A", cor: "#C7D6F5" },
  { inicial: "L", cor: "#E6C5B5" },
  { inicial: "R", cor: "#EFA6A6" },
] as const;

export function HeroArt() {
  return (
    <div className="relative mx-auto w-full max-w-[440px] min-w-0">
      {/* Painel do técnico */}
      <div className="surface-card relative rounded-[28px] px-6 pt-8 pb-6 shadow-(--shadow-float)">
        {/* Pontos decorativos do painel (handoff) */}
        <span aria-hidden="true" className="absolute top-5 left-6 flex gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] opacity-40" />
        </span>

        {/* Slot da foto do técnico */}
        <div
          className="mx-auto grid h-[160px] w-[160px] place-items-center rounded-full"
          style={{ background: "#EFE8FF" }}
        >
          <span className="text-[var(--accent-text)]">
            <Icon name="magnifying-glass" className="text-[3.6rem]" />
          </span>
        </div>
        <p className="text-muted mx-auto mt-4 max-w-[200px] text-center text-[0.8125rem] leading-snug">
          Espaço reservado para a foto do técnico em atendimento
        </p>
      </div>

      {/* Card flutuante — valor combinado (canto superior direito) */}
      <div className="surface-card absolute -top-4 -right-2 rounded-[18px] px-4 py-2.5 shadow-(--shadow-float) sm:-right-6">
        <p className="eyebrow">Valor combinado</p>
        <p className="num mt-1 text-[1.125rem] font-extrabold text-[var(--accent-text)]">
          R$ 280,00
        </p>
      </div>

      {/* Card flutuante — técnico a caminho (canto inferior esquerdo) */}
      <div className="surface-card absolute -bottom-5 -left-2 flex items-center gap-2.5 rounded-[18px] px-4 py-2.5 shadow-(--shadow-float) sm:-left-6">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ background: "#E4FAF2" }}
        >
          <Icon name="circle" className="text-[0.7rem] text-[#27C281]" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold">Técnico a caminho</p>
          <p className="num text-muted text-xs">12 min</p>
        </div>
      </div>

      {/* Prova social — avatares + 200+ (handoff: "200+") */}
      <div className="surface-card relative z-10 mt-5 inline-flex max-w-full items-center gap-3.5 rounded-[18px] px-4 py-3 shadow-(--shadow-raised)">
        <div className="flex shrink-0 -space-x-2.5">
          {AVATARES.map((avatar) => (
            <span
              key={avatar.inicial}
              className="grid h-10 w-10 place-items-center rounded-full border-2 border-white text-[0.8125rem] font-bold"
              style={{ background: avatar.cor, color: "#130B38" }}
            >
              {avatar.inicial}
            </span>
          ))}
          <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-[var(--surface-border)] bg-white text-[0.8125rem] font-bold text-[#130B38]">
            200+
          </span>
        </div>
        <p className="min-w-0 text-[0.8125rem] leading-snug font-semibold">
          Técnicos verificados na sua região
        </p>
      </div>
    </div>
  );
}
