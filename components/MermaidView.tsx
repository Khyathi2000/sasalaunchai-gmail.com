"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  code: string;
}

export function MermaidView({ code }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          fontFamily: "var(--font-mono)",
          themeVariables: {
            background: "transparent",
            primaryColor: "#FAFAF7",
            primaryTextColor: "#0A0A0A",
            primaryBorderColor: "#0A0A0A",
            lineColor: "#0A0A0A",
            secondaryColor: "#F0F0EA",
            tertiaryColor: "#FAFAF7",
            fontSize: "12px",
          },
        });
        const { svg } = await mermaid.render(idRef.current, code);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <pre className="overflow-auto border border-border p-3 text-xs text-muted-foreground">
        <span className="text-err">[mermaid render error] </span>
        {error}
        {"\n\n"}
        {code}
      </pre>
    );
  }

  return <div ref={ref} className="overflow-auto" />;
}
