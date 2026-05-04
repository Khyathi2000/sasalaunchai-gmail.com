"use client";

import { useEffect, useRef, useState } from "react";

type DiagramKind = "architecture" | "cicd" | "deployment";

interface Props {
  diagrams: { architecture: string; cicd: string; deployment: string };
}

export function DiagramTabs({ diagrams }: Props) {
  const [active, setActive] = useState<DiagramKind>("architecture");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            background: "transparent",
            primaryColor: "#fafaf6",
            primaryTextColor: "#1a1a1a",
            primaryBorderColor: "#1a1a1a",
            lineColor: "#666",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: "13px",
          },
        });
        const code = diagrams[active];
        const id = `mmd-${active}-${Date.now()}`;
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (err) {
        if (!cancelled && ref.current) {
          ref.current.innerHTML =
            `<pre class="text-err text-xs">mermaid render failed: ${
              err instanceof Error ? err.message : String(err)
            }\n\n${escape(diagrams[active])}</pre>`;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, diagrams]);

  return (
    <div className="border border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[0.65rem] uppercase tracking-wider">
        <div className="flex gap-2">
          <Tab kind="architecture" active={active} setActive={setActive}>
            architecture
          </Tab>
          <Tab kind="cicd" active={active} setActive={setActive}>
            ci/cd
          </Tab>
          <Tab kind="deployment" active={active} setActive={setActive}>
            deployment flow
          </Tab>
        </div>
      </div>
      <div ref={ref} className="overflow-auto p-4 [&_svg]:max-w-full [&_svg]:h-auto" />
    </div>
  );
}

function Tab({
  kind,
  active,
  setActive,
  children,
}: {
  kind: DiagramKind;
  active: DiagramKind;
  setActive: (k: DiagramKind) => void;
  children: React.ReactNode;
}) {
  const on = active === kind;
  return (
    <button
      onClick={() => setActive(kind)}
      className={
        on
          ? "border border-ink bg-ink px-2 py-0.5 text-cream"
          : "border border-border px-2 py-0.5 text-muted-foreground hover:text-ink"
      }
    >
      {children}
    </button>
  );
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
