"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  fullWidth?: boolean;
}

export default function BigButton({
  children,
  variant = "primary",
  fullWidth = true,
  className = "",
  ...rest
}: BigButtonProps) {
  const base =
    "rounded-control px-6 py-4 text-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-accent text-white hover:bg-accent-dark",
    secondary: "bg-white text-ink border-2 border-line hover:border-accent",
    danger: "bg-danger text-white hover:bg-danger",
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
