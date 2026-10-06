import type { ButtonHTMLAttributes } from "react";
import { cx } from "../cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors " +
  "disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-soft",
  secondary: "border border-border-strong bg-surface text-foreground hover:bg-raised",
  ghost: "text-foreground hover:bg-raised",
  danger: "bg-danger text-danger-foreground hover:opacity-90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-sm",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-7 text-base",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cx(base, variants[variant], sizes[size]);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return <button type={type} className={cx(buttonClasses(variant, size), className)} {...props} />;
}
