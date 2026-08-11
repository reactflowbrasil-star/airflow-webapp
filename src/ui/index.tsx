import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

export { Button, ButtonLink } from "./button";

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={clsx(
        "surface-card rounded-(--radius-card) shadow-(--shadow-subtle)",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Input / Field                                                               */
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && (
          <span className="text-danger-500 ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-muted text-xs">{hint}</p>}
      {error && (
        <p role="alert" className="text-danger-700 text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={clsx(
        "surface-card h-11 rounded-(--radius-field) px-3.5 text-[0.9375rem]",
        "placeholder:text-[var(--text-muted)]",
        "focus:border-brand-500 transition-colors outline-none",
        "disabled:opacity-60",
        "aria-[invalid=true]:border-danger-500",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={clsx(
        "surface-card min-h-28 rounded-(--radius-field) px-3.5 py-2.5 text-[0.9375rem]",
        "placeholder:text-[var(--text-muted)]",
        "focus:border-brand-500 transition-colors outline-none",
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                       */
/* -------------------------------------------------------------------------- */

type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "ice";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-[var(--surface-muted)] text-secondary",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200",
  success: "bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-500",
  warning: "bg-warning-50 text-warning-700 dark:bg-warning-700/20 dark:text-warning-500",
  danger: "bg-danger-50 text-danger-700 dark:bg-danger-700/20 dark:text-danger-500",
  ice: "bg-ice-50 text-ice-700 dark:bg-ice-700/20 dark:text-ice-300",
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
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Alert                                                                       */
/* -------------------------------------------------------------------------- */

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
      className={clsx("rounded-(--radius-field) px-4 py-3 text-sm", BADGE_TONES[tone])}
    >
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton e Empty State                                                      */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={clsx("skeleton rounded-(--radius-field)", className)}
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
      {icon && <div className="text-brand-400 mb-1">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-secondary max-w-sm text-sm">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Estrelas de avaliação                                                       */
/* -------------------------------------------------------------------------- */

export function Rating({ value, count }: { value: number; count?: number }) {
  const rounded = Math.round(value * 10) / 10;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <svg
        viewBox="0 0 20 20"
        className="fill-warning-500 h-4 w-4"
        aria-hidden="true"
      >
        <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
      </svg>
      <span className="font-semibold">{rounded.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-muted">
          ({count} {count === 1 ? "avaliação" : "avaliações"})
        </span>
      )}
    </span>
  );
}
