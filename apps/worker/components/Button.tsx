"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  fullWidth?: boolean;
}

export default function Button({ children, variant = "primary", fullWidth = true, className = "", ...rest }: ButtonProps) {
  const variants = {
    primary: "bg-accent text-white shadow-card hover:bg-accent-dark",
    secondary: "bg-white text-ink border-2 border-line hover:border-accent",
    danger: "bg-white text-danger border-2 border-danger/40 hover:bg-danger-light",
  };
  return (
    <button
      className={`min-h-[48px] rounded-control px-5 py-3 text-lg font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
