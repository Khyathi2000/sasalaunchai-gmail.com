"use client";

import { useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { useStore } from "@/lib/store";
import { useEventStream } from "@/lib/sse";
import { fmtCurrency } from "@/lib/utils";
import type { CostBreakdown } from "@/lib/core";

export function CostChart() {
  const sid = useStore((s) => s.sid);
  const cost = useStore((s) => s.cost);
  const history = useStore((s) => s.costHistory);
  const setCost = useStore((s) => s.setCost);
  const pushCostPoint = useStore((s) => s.pushCostPoint);

  useEventStream(sid ? `/api/monitor/cost?sid=${sid}` : null, {
    estimate: (data) => {
      const d = data as CostBreakdown;
      setCost(d);
      pushCostPoint({ daily: d.totalDaily, monthly: d.totalMonthly });
    },
    real: (data) => {
      // Real Cost Explorer overlay — replace estimate
      const d = data as CostBreakdown;
      setCost(d);
    },
  }, [sid]);

  // Force a fresh point every 30s on the wall clock so the chart "moves" even
  // when totals don't change.
  useEffect(() => {
    if (!cost) return;
    const t = setInterval(() => {
      pushCostPoint({ daily: cost.totalDaily, monthly: cost.totalMonthly });
    }, 30_000);
    return () => clearInterval(t);
  }, [cost, pushCostPoint]);

  const data = history.map((p) => ({ ...p, label: new Date(p.t).toLocaleTimeString() }));

  return (
    <div className="border border-border">
      <header className="flex items-baseline justify-between border-b border-border px-4 py-2 text-[0.65rem] uppercase tracking-wider">
        <span>[ cost ]</span>
        {cost && (
          <span>
            {fmtCurrency(cost.totalDaily)}/d · {fmtCurrency(cost.totalMonthly)}/mo
            <span className="ml-2 normal-case text-muted-foreground">{cost.currency}</span>
          </span>
        )}
      </header>
      <div className="h-56 px-2 py-2">
        {data.length < 2 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            collecting samples... <span className="caret ml-2"></span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="hsl(var(--muted))"
                tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                interval="preserveEnd"
              />
              <YAxis
                stroke="hsl(var(--muted))"
                tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                tickFormatter={(v) => `$${v}`}
                width={42}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--bg))",
                  border: "1px solid hsl(var(--fg))",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                }}
                labelStyle={{ color: "hsl(var(--fg))" }}
                formatter={(v: number, name: string) => [fmtCurrency(v), name]}
              />
              <Line
                type="monotone"
                dataKey="daily"
                name="daily"
                stroke="hsl(var(--fg))"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="monthly"
                name="monthly"
                stroke="hsl(var(--ok))"
                strokeWidth={1}
                dot={false}
                strokeDasharray="3 3"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {cost && cost.byService.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <h4 className="mb-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">by service</h4>
          <ul className="space-y-1 text-xs">
            {cost.byService.slice(0, 8).map((s) => (
              <li key={s.serviceId} className="flex justify-between">
                <span>{s.serviceId}</span>
                <span className="text-muted-foreground">
                  {fmtCurrency(s.dailyCost)}/d
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
