import { clsx } from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

/** Primário é o gradiente da marca; pill em todos os tamanhos (handoff). */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-grad text-white shadow-(--shadow-subtle) hover:-translate-y-0.5 hover:shadow-(--shadow-raised)",
  secondary:
    "surface-card text-[var(--text-primary)] hover:border-[var(--accent)] hover:-translate-y-0.5",
  ghost:
    "text-[var(--accent-text)] hover:bg-[var(--accent-soft)] active:bg-[var(--accent-soft)]",
  danger: "bg-danger-500 text-white hover:bg-danger-700 hover:-translate-y-0.5",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-[0.8125rem] gap-1.5",
  md: "h-11 px-5 text-[0.9375rem] gap-2",
  lg: "h-13 px-7 text-base gap-2.5",
};

function classes(variant: Variant, size: Size, fullWidth: boolean, className?: string) {
  return clsx(
    "inline-flex items-center justify-center rounded-(--radius-pill) font-semibold",
    "tracking-[-0.01em] transition-all duration-250 select-none",
    "disabled:opacity-50 disabled:pointer-events-none disabled:translate-y-0",
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
    className,
  );
}

interface BaseProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  children,
  ...props
}: BaseProps & ComponentProps<"button">) {
  return (
    <button className={classes(variant, size, fullWidth, className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  children,
  ...props
}: BaseProps & ComponentProps<typeof Link>) {
  return (
    <Link className={classes(variant, size, fullWidth, className)} {...props}>
      {children}
    </Link>
  );
}
