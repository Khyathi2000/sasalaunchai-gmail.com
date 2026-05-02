"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "primary" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

export const BracketButton = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "default", loading, className, disabled, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        data-variant={variant}
        disabled={disabled || loading}
        className={cn("bracket-btn text-xs", className)}
        {...rest}
      >
        <span aria-hidden>[</span>
        <span className="px-2">{loading ? "..." : children}</span>
        <span aria-hidden>]</span>
      </button>
    );
  },
);
BracketButton.displayName = "BracketButton";
