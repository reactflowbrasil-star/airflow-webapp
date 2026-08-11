import { clsx } from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-(--shadow-subtle)",
  secondary:
    "surface-card text-[var(--text-primary)] hover:bg-[var(--surface-muted)] active:bg-[var(--surface-border)]",
  ghost:
    "text-brand-700 hover:bg-brand-50 active:bg-brand-100 dark:text-brand-200 dark:hover:bg-brand-950",
  danger: "bg-danger-500 text-white hover:bg-danger-700 active:bg-danger-700",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-[0.9375rem] gap-2",
  lg: "h-13 px-7 text-base gap-2.5",
};

function classes(variant: Variant, size: Size, fullWidth: boolean, className?: string) {
  return clsx(
    "inline-flex items-center justify-center rounded-(--radius-field) font-medium",
    "transition-colors duration-150 select-none",
    "disabled:opacity-50 disabled:pointer-events-none",
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
