"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function BracketCheckbox({
  checked,
  onChange,
  label,
  description,
  trailing,
  disabled,
  className,
}: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "group flex w-full items-start gap-3 border border-transparent px-3 py-2 text-left text-xs uppercase tracking-wider",
        "hover:border-ink hover:bg-ink/[0.03]",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        "focus:outline-none focus-visible:border-ink",
        className,
      )}
    >
      <span className="font-mono select-none">
        [{checked ? "X" : " "}]
      </span>
      <span className="flex-1">
        <span className="block">{label}</span>
        {description && (
          <span className="mt-1 block text-[0.65rem] normal-case tracking-normal text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      {trailing && (
        <span className="text-[0.65rem] normal-case tracking-normal text-muted-foreground">
          {trailing}
        </span>
      )}
    </button>
  );
}
