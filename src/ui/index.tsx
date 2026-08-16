import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

export { Button, ButtonLink } from "./button";

/* -------------------------------------------------------------------------- */
/* Ícone Phosphor (duotone) */
/* -------------------------------------------------------------------------- */
/**
 * Ícone da biblioteca Phosphor em variante duotone.
 * `aria-hidden` por padrão: ícone aqui é sempre decorativo, o rótulo textual
 * ao lado é quem carrega o significado para leitores de tela (§62).
 */
export function Icon({
  name,
  className,
}: {
  /** Nome sem prefixo, ex.: "drop", "wrench", "shield-check". */
  name: string;
  className?: string;
}) {
  return <i className={clsx("ph-duotone", `ph-${name}`, className)} aria-hidden="true" />;
}

/** Ícone dentro de caixa arredondada — padrão de card do handoff com microinteração. */
export function IconBox({
  name,
  tone = "soft",
  size = 50,
  className,
}: {
  name: string;
  tone?: "soft" | "grad" | "subtle";
  size?: number;
  className?: string;
}) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.48 }}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-[16px] transition-transform duration-200 group-hover:scale-105",
        tone === "grad" && "bg-grad text-white shadow-sm",
        tone === "soft" && "accent-soft border border-[var(--accent-border)] text-[var(--accent-text)]",
        tone === "subtle" && "bg-[var(--surface-muted)] text-[var(--text-secondary)] border border-[var(--surface-border)]",
        className,
      )}
    >
      <Icon name={name} />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Card */
/* -------------------------------------------------------------------------- */
export function Card({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={clsx(
        "surface-card rounded-(--radius-card) border border-[var(--surface-border)] shadow-(--shadow-subtle) transition-colors",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Card que reage ao ponteiro — usado em listagens clicáveis. */
export function HoverCard({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <Card
      className={clsx(
        "group cursor-pointer transition-all duration-300 ease-out hover:-translate-y-1.5",
        "hover:border-[var(--accent)] hover:shadow-(--shadow-float) active:translate-y-0 active:scale-[0.99]",
        className,
      )}
      {...props}
    >
      {children}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Campos */
/* -------------------------------------------------------------------------- */
interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor: string;
}

/** Label sempre associada ao controle — requisito de acessibilidade (§62). */
export function Field({ label, hint, error, required, children, htmlFor }: FieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="flex items-center justify-between text-[0.8125rem] font-semibold text-[var(--text-primary)]">
        <span>
          {label}
          {required && (
            <span className="text-danger-500 ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </span>
        {required && <span className="text-[0.6875rem] font-normal text-[var(--text-muted)]">Obrigatório</span>}
      </label>
      {children}
      {hint && !error && <p className="text-muted text-xs leading-snug">{hint}</p>}
      {error && (
        <p role="alert" className="text-danger-700 flex items-center gap-1.5 text-xs font-medium animate-in fade-in">
          <Icon name="warning-circle" className="text-sm shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  "surface-card w-full rounded-(--radius-field) border border-[var(--surface-border)] text-[0.9375rem] " +
  "placeholder:text-[var(--text-muted)] outline-none transition-all duration-200 " +
  "focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 disabled:opacity-60 aria-[invalid=true]:border-danger-500";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={clsx(CONTROL, "h-12 px-4", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={clsx(CONTROL, "min-h-[118px] px-4 py-3 resize-y", className)} {...props} />
  );
}

/**
 * Linha selecionável (serviço, endereço, método de pagamento).
 * O radio nativo fica oculto mas presente: teclado e leitor de tela continuam
 * funcionando, e o anel visual é desenhado por CSS.
 */
export function SelectableRow({
  selected,
  className,
  children,
  ...props
}: { selected: boolean } & ComponentProps<"label">) {
  return (
    <label
      className={clsx(
        "flex cursor-pointer items-center gap-3.5 rounded-[18px] border p-4",
        "transition-all duration-250",
        selected
          ? "accent-soft border-[var(--accent)] shadow-xs"
          : "surface-card border-[var(--surface-border)] hover:border-[var(--accent-border)]",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}

/** Marcador circular do SelectableRow: anel de 5px quando ativo. */
export function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "inline-block h-[18px] w-[18px] shrink-0 rounded-full border-2 transition-all",
        selected
          ? "border-[5px] border-[var(--accent)] bg-transparent"
          : "border-[var(--surface-border)]",
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Chip / Badge / Alert */
/* -------------------------------------------------------------------------- */
export function Chip({
  active,
  className,
  children,
  ...props
}: { active?: boolean } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={clsx(
        "rounded-(--radius-pill) border px-3.5 py-2 text-[0.8125rem] font-medium",
        "transition-all duration-250 active:scale-95",
        active
          ? "border-transparent bg-grad text-white shadow-xs"
          : "surface-card border-[var(--surface-border)] hover:border-[var(--accent-border)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "ice";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "surface-muted text-secondary border-transparent",
  brand: "accent-soft border-[var(--accent-border)] border text-[var(--accent-text)]",
  success: "bg-[var(--ok-soft)] border-[var(--ok-border)] border text-[var(--ok-text)]",
  warning: "bg-[var(--warn-soft)] border-[var(--warn-border)] border text-[var(--warn-text)]",
  danger: "bg-danger-50 text-danger-700 border border-transparent dark:bg-danger-700/15",
  ice: "accent-soft border-[var(--accent-border)] border text-[var(--accent-text)]",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-(--radius-pill) px-3 py-1",
        "text-[0.6875rem] font-semibold tracking-[0.02em] whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Ponto de status que pisca — "recebendo solicitações", "online agora". */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className="relative flex h-2 w-2 items-center justify-center">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
      <span
        aria-hidden="true"
        className={clsx(
          "anim-blink relative inline-block h-1.5 w-1.5 rounded-full bg-current",
          className,
        )}
      />
    </span>
  );
}

export function Alert({
  tone = "brand",
  title,
  children,
}: {
  tone?: BadgeTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={clsx("rounded-[16px] px-4 py-3.5 text-sm border", BADGE_TONES[tone])}
    >
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="font-normal">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton, Empty state e Rating */
/* -------------------------------------------------------------------------- */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={clsx("skeleton rounded-[14px] animate-pulse bg-[var(--surface-muted)]", className)}
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon ?? <IconBox name="tray-arrow-down" size={52} />}
      <h3 className="text-lg font-bold tracking-[-0.02em]">{title}</h3>
      <p className="text-secondary max-w-sm text-sm leading-relaxed">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Rating({ value, count }: { value: number; count?: number }) {
  const rounded = Math.round(value * 10) / 10;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <svg
        viewBox="0 0 20 20"
        className="h-4 w-4"
        style={{ fill: "var(--star)" }}
        aria-hidden="true"
      >
        <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
      </svg>
      <span className="num font-bold">{rounded.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-muted">
          ({count} {count === 1 ? "avaliação" : "avaliações"})
        </span>
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar e progresso */
/* -------------------------------------------------------------------------- */
/** Avatar de iniciais em gradiente — usado quando não há foto. */
export function Avatar({
  name,
  size = 44,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const iniciais = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={clsx(
        "bg-grad inline-flex shrink-0 items-center justify-center rounded-full",
        "font-bold text-white shadow-xs",
        className,
      )}
      aria-hidden="true"
    >
      {iniciais}
    </span>
  );
}

/**
 * Barra de progresso do serviço. O brilho varrendo só aparece enquanto há
 * etapa em andamento — num serviço concluído ele seria ruído.
 */
export function ProgressBar({
  etapas,
  atual,
}: {
  etapas: readonly string[];
  /** Índice da etapa corrente (0-based). */
  atual: number;
}) {
  const pct = etapas.length <= 1 ? 100 : (atual / (etapas.length - 1)) * 100;
  const emAndamento = atual < etapas.length - 1;

  return (
    <div>
      <div
        className="relative h-1.5 overflow-hidden rounded-full"
        style={{ background: "var(--track)" }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={etapas.length - 1}
        aria-valuenow={atual}
        aria-label={`Etapa ${atual + 1} de ${etapas.length}: ${etapas[atual]}`}
      >
        <div
          className={clsx(
            "bg-grad relative h-full rounded-full transition-[width] duration-[800ms]",
            emAndamento && "anim-sweep overflow-hidden",
          )}
          style={{
            width: `${pct}%`,
            transitionTimingFunction: "cubic-bezier(.2,.7,.2,1)",
          }}
        />
      </div>
      <ol className="mt-2 flex justify-between gap-1">
        {etapas.map((etapa, i) => (
          <li
            key={etapa}
            className={clsx(
              "text-[0.625rem] font-medium tracking-[0.02em]",
              i <= atual ? "text-[var(--accent-text)]" : "text-muted",
            )}
          >
            {etapa}
          </li>
        ))}
      </ol>
    </div>
  );
}
