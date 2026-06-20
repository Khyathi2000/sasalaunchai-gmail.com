"use client";

import { useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { postEventStream } from "@/lib/sse";
import { fmtCurrency } from "@/lib/utils";
import type {
  AWSAccountInfo,
  AWSResource,
  AWSMetrics,
  AWSCostData,
} from "@core/monitoring/collectors/aws-discovery.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanLogEntry {
  service: string;
  msg: string;
  isError: boolean;
}

type Phase = "input" | "scanning" | "done";

const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-central-1", "eu-west-1", "eu-west-2", "eu-west-3",
  "ap-northeast-1", "ap-northeast-2", "ap-southeast-1", "ap-southeast-2",
  "ap-south-1", "sa-east-1", "ca-central-1",
];

const SERVICE_LABELS: Record<string, string> = {
  ec2: "EC2",
  lambda: "Lambda",
  rds: "RDS",
  s3: "S3",
  ecs: "ECS",
  dynamodb: "DynamoDB",
  sqs: "SQS",
  elasticache: "ElastiCache",
};

const ALL_SERVICES = ["ec2", "lambda", "rds", "s3", "ecs", "dynamodb", "sqs", "elasticache"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: AWSResource["status"] }) {
  const ok = status === "running" || status === "active" || status === "available";
  const stopped = status === "stopped";
  const color = ok ? "hsl(var(--ok))" : stopped ? "hsl(var(--muted))" : "hsl(var(--warn))";
  return (
    <span aria-hidden style={{ color }}>
      {ok ? "●" : stopped ? "○" : "◌"}
    </span>
  );
}

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">[ {label} ]</p>
      {sub && <span className="text-[0.65rem] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function UnavailableCard({ label, message }: { label: string; message?: string }) {
  return (
    <div className="mb-6 border border-border border-dashed px-4 py-4">
      <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-1">
        [ {label} ]
      </p>
      <p className="text-xs text-muted-foreground">
        {message ?? "not available"}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AWSConsole() {
  const [phase, setPhase] = useState<Phase>("input");
  const [form, setForm] = useState({
    accessKeyId: "",
    secretAccessKey: "",
    sessionToken: "",
    region: "us-east-1",
  });
  const [account, setAccount] = useState<AWSAccountInfo | null>(null);
  const [resources, setResources] = useState<AWSResource[]>([]);
  const [metricsMap, setMetricsMap] = useState<Record<string, AWSMetrics>>({});
  const [cost, setCost] = useState<AWSCostData | null>(null);
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const [unavailableServices, setUnavailableServices] = useState<Set<string>>(new Set());
  const [scannedAt, setScannedAt] = useState<Date | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function resetState() {
    setAccount(null);
    setResources([]);
    setMetricsMap({});
    setCost(null);
    setScanLog([]);
    setUnavailableServices(new Set());
    setScannedAt(null);
    setLogOpen(false);
  }

  async function startScan() {
    if (!form.accessKeyId.trim() || !form.secretAccessKey.trim()) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    resetState();
    setPhase("scanning");

    try {
      await postEventStream(
        "/api/aws/scan",
        {
          accessKeyId: form.accessKeyId.trim(),
          secretAccessKey: form.secretAccessKey.trim(),
          sessionToken: form.sessionToken.trim() || undefined,
          region: form.region,
        },
        {
          account: (d) => setAccount(d as AWSAccountInfo),
          resource: (d) =>
            setResources((prev) => {
              const r = d as AWSResource;
              if (prev.find((x) => x.id === r.id)) return prev;
              return [...prev, r];
            }),
          metrics: (d) =>
            setMetricsMap((prev) => {
              const m = d as AWSMetrics;
              return { ...prev, [m.resourceId]: m };
            }),
          cost: (d) => setCost(d as AWSCostData),
          progress: (d) => {
            const e = d as { service: string; message: string };
            if (e.message.toLowerCase().includes("not available")) {
              setUnavailableServices((prev) => new Set([...prev, e.service]));
            }
            setScanLog((prev) => [
              ...prev.slice(-49),
              { service: e.service, msg: e.message, isError: false },
            ]);
          },
          error: (d) => {
            const e = d as { service?: string; message: string };
            setScanLog((prev) => [
              ...prev.slice(-49),
              { service: e.service ?? "scan", msg: e.message, isError: true },
            ]);
          },
          done: () => {
            setPhase("done");
            setScannedAt(new Date());
          },
        },
        ac.signal,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setScanLog((prev) => [...prev, { service: "scan", msg, isError: true }]);
      setPhase("done");
      setScannedAt(new Date());
    }
  }

  function stopScan() {
    abortRef.current?.abort();
    setPhase("done");
    setScannedAt(new Date());
  }

  // Derived
  const runningCount = resources.filter(
    (r) => r.status === "running" || r.status === "active" || r.status === "available",
  ).length;
  const stoppedCount = resources.filter((r) => r.status === "stopped").length;
  const metricsEntries = Object.values(metricsMap);
  const availableServicesCount = ALL_SERVICES.filter((s) => !unavailableServices.has(s)).length;
  const showDashboard = resources.length > 0 || cost !== null || phase === "done";

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-8 py-8 xl:px-16">
      {/* Page header */}
      <div className="mb-8 flex items-baseline justify-between">
        <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          [ aws / account console ]
        </p>
        {phase !== "input" && (
          <button
            onClick={() => { stopScan(); resetState(); setPhase("input"); }}
            className="bracket-btn text-xs"
          >
            <span aria-hidden>[</span>
            <span className="px-2">new scan</span>
            <span aria-hidden>]</span>
          </button>
        )}
      </div>

      {/* ── Credentials form ── */}
      {phase === "input" && (
        <CredentialsForm form={form} setForm={setForm} onScan={startScan} />
      )}

      {/* ── Scan progress ── */}
      {phase === "scanning" && (
        <div className="mb-6 flex items-center gap-3 border border-border px-4 py-2 text-xs">
          <span className="caret text-muted-foreground" />
          <span className="text-muted-foreground">
            {scanLog.length > 0 ? scanLog[scanLog.length - 1].msg : "scanning..."}
          </span>
          <button onClick={stopScan} className="ml-auto bracket-btn text-[0.65rem]">
            <span aria-hidden>[</span><span className="px-2">stop</span><span aria-hidden>]</span>
          </button>
        </div>
      )}

      {/* ── Dashboard ── */}
      {showDashboard && (
        <>
          {account && <AccountBar account={account} scannedAt={scannedAt} />}

          <KPIStrip
            total={resources.length}
            running={runningCount}
            stopped={stoppedCount}
            services={availableServicesCount}
            cost={cost}
            phase={phase}
          />

          {(phase === "done" || resources.length > 0) && (
            <ServiceGrid
              resources={resources}
              unavailableServices={unavailableServices}
              metricsMap={metricsMap}
              phase={phase}
            />
          )}

          {resources.length > 0 && (
            <ResourcesByService resources={resources} metricsMap={metricsMap} />
          )}

          {cost && cost.byService.length > 0 ? (
            <CostSection cost={cost} />
          ) : phase === "done" ? (
            <UnavailableCard
              label="billing"
              message="Cost Explorer not enabled. Enable it in the AWS console to see spending data."
            />
          ) : null}

          {metricsEntries.length > 0 && <MetricsSection metrics={metricsEntries} />}

          <ScanLogSection
            log={scanLog}
            phase={phase}
            open={logOpen}
            onToggle={() => setLogOpen((o) => !o)}
          />
        </>
      )}
    </div>
  );
}

// ─── Credentials form ─────────────────────────────────────────────────────────

interface FormState {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  region: string;
}

function CredentialsForm({
  form,
  setForm,
  onScan,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onScan: () => void;
}) {
  const ready = form.accessKeyId.trim().length > 0 && form.secretAccessKey.trim().length > 0;

  return (
    <div className="border border-border">
      <header className="border-b border-border px-4 py-2 text-[0.65rem] uppercase tracking-wider">
        [ credentials ]
      </header>
      <div className="grid gap-4 p-6 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            access key id
          </span>
          <input
            type="text"
            placeholder="AKIA..."
            value={form.accessKeyId}
            onChange={(e) => setForm((f) => ({ ...f, accessKeyId: e.target.value }))}
            className="border border-border bg-transparent px-3 py-2 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            secret access key
          </span>
          <input
            type="password"
            placeholder="••••••••••••••••••••••••••••••••••••••••"
            value={form.secretAccessKey}
            onChange={(e) => setForm((f) => ({ ...f, secretAccessKey: e.target.value }))}
            className="border border-border bg-transparent px-3 py-2 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            region
          </span>
          <select
            value={form.region}
            onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
            className="border border-border bg-transparent px-3 py-2 font-mono text-xs focus:outline-none focus:border-foreground"
          >
            {AWS_REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            session token{" "}
            <span className="normal-case text-muted-foreground/60">(optional)</span>
          </span>
          <input
            type="password"
            placeholder="temporary credentials only"
            value={form.sessionToken}
            onChange={(e) => setForm((f) => ({ ...f, sessionToken: e.target.value }))}
            className="border border-border bg-transparent px-3 py-2 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground"
          />
        </label>
      </div>
      <div className="border-t border-border px-6 py-4">
        <p className="mb-3 text-[0.65rem] text-muted-foreground">
          Credentials are sent directly to AWS and are not stored. Requires{" "}
          <code className="text-foreground">ReadOnlyAccess</code> or equivalent.
        </p>
        <button
          disabled={!ready}
          onClick={onScan}
          data-variant="primary"
          className="bracket-btn text-xs"
        >
          <span aria-hidden>[</span>
          <span className="px-2">scan account →</span>
          <span aria-hidden>]</span>
        </button>
      </div>
    </div>
  );
}

// ─── Account bar ──────────────────────────────────────────────────────────────

function AccountBar({ account, scannedAt }: { account: AWSAccountInfo; scannedAt: Date | null }) {
  return (
    <div className="mb-6 border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-6">
          <span>
            <span className="text-muted-foreground text-[0.65rem] uppercase tracking-wider mr-2">account</span>
            <span className="font-mono">{account.accountId}</span>
          </span>
          <span>
            <span className="text-muted-foreground text-[0.65rem] uppercase tracking-wider mr-2">region</span>
            <span className="font-mono">{account.region}</span>
          </span>
          <span className="hidden xl:inline">
            <span className="text-muted-foreground text-[0.65rem] uppercase tracking-wider mr-2">arn</span>
            <span className="font-mono text-muted-foreground truncate max-w-xs inline-block align-bottom">
              {account.arn}
            </span>
          </span>
        </div>
        {scannedAt && (
          <span className="text-[0.65rem] text-muted-foreground">
            scanned {scannedAt.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────────

function KPIStrip({
  total, running, stopped, services, cost, phase,
}: {
  total: number;
  running: number;
  stopped: number;
  services: number;
  cost: AWSCostData | null;
  phase: Phase;
}) {
  return (
    <div className="mb-6">
      <SectionHeader label="overview" />
      <div className="grid gap-px border border-border md:grid-cols-5">
        <KPICell label="total resources" value={String(total)} />
        <KPICell label="running / active" value={String(running)} ok />
        <KPICell label="stopped" value={String(stopped)} muted={stopped === 0} />
        <KPICell
          label="services available"
          value={phase === "done" ? `${services} / 8` : "—"}
        />
        {cost ? (
          <KPICell label="monthly spend" value={fmtCurrency(cost.totalCost)} />
        ) : (
          <KPICell label="monthly spend" value="not enabled" muted />
        )}
      </div>
    </div>
  );
}

function KPICell({
  label, value, ok, muted,
}: {
  label: string;
  value: string;
  ok?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <div
        className="text-xl font-mono"
        style={ok ? { color: "hsl(var(--ok))" } : undefined}
      >
        <span className={muted ? "text-muted-foreground" : undefined}>{value}</span>
      </div>
      <div className="mt-0.5 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

// ─── Service grid ─────────────────────────────────────────────────────────────

function ServiceGrid({
  resources,
  unavailableServices,
  metricsMap,
  phase,
}: {
  resources: AWSResource[];
  unavailableServices: Set<string>;
  metricsMap: Record<string, AWSMetrics>;
  phase: Phase;
}) {
  return (
    <div className="mb-6">
      <SectionHeader label="services" />
      <div className="grid gap-px border border-border md:grid-cols-4">
        {ALL_SERVICES.map((svc) => {
          const svcResources = resources.filter((r) => r.service === svc);
          const isUnavailable = unavailableServices.has(svc);
          const isLoading = phase === "scanning" && !isUnavailable && svcResources.length === 0;
          return (
            <ServiceCard
              key={svc}
              service={svc}
              resources={svcResources}
              isUnavailable={isUnavailable}
              isLoading={isLoading}
              metricsMap={metricsMap}
            />
          );
        })}
      </div>
    </div>
  );
}

function ServiceCard({
  service,
  resources,
  isUnavailable,
  isLoading,
  metricsMap,
}: {
  service: string;
  resources: AWSResource[];
  isUnavailable: boolean;
  isLoading: boolean;
  metricsMap: Record<string, AWSMetrics>;
}) {
  const label = SERVICE_LABELS[service] ?? service;
  const runningR = resources.filter(
    (r) => r.status === "running" || r.status === "active" || r.status === "available",
  );
  const stoppedR = resources.filter((r) => r.status === "stopped");

  // Service-specific summary line
  function summary() {
    if (isUnavailable) return null;
    if (resources.length === 0) return null;

    if (service === "s3") {
      const regions = Array.from(new Set(resources.map((r) => String(r.metadata.region ?? r.region)))).slice(0, 3);
      return <span className="text-[0.65rem] text-muted-foreground">{regions.join(", ")}</span>;
    }
    if (service === "lambda") {
      const aggMetrics = metricsMap["lambda:aggregate"];
      if (aggMetrics?.invocations !== undefined) {
        return (
          <span className="text-[0.65rem] text-muted-foreground">
            {aggMetrics.invocations.toLocaleString()} invocations / 24h
          </span>
        );
      }
    }
    if (service === "rds") {
      const engines = Array.from(new Set(resources.map((r) => String(r.metadata.engine ?? "")))).filter(Boolean);
      return <span className="text-[0.65rem] text-muted-foreground">{engines.join(", ")}</span>;
    }
    if (service === "sqs") {
      const msgs = resources.reduce((sum, r) => sum + (Number(r.metadata.messageCount) || 0), 0);
      return <span className="text-[0.65rem] text-muted-foreground">{msgs} messages</span>;
    }
    if (service === "dynamodb") {
      const items = resources.reduce((sum, r) => sum + (Number(r.metadata.itemCount) || 0), 0);
      return items > 0
        ? <span className="text-[0.65rem] text-muted-foreground">{items.toLocaleString()} items</span>
        : null;
    }
    if (service === "elasticache") {
      const engines = Array.from(new Set(resources.map((r) => String(r.metadata.engine ?? "")))).filter(Boolean);
      return <span className="text-[0.65rem] text-muted-foreground">{engines.join(", ")}</span>;
    }
    return null;
  }

  return (
    <div className="px-4 py-4">
      <div className="mb-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>

      {isUnavailable ? (
        <div className="text-sm font-mono text-muted-foreground/50">not available</div>
      ) : isLoading ? (
        <div className="text-sm font-mono text-muted-foreground/50">scanning...</div>
      ) : resources.length === 0 ? (
        <div className="text-sm font-mono text-muted-foreground/50">none found</div>
      ) : (
        <>
          <div className="text-xl font-mono">{resources.length}</div>
          <div className="mt-1.5 space-y-0.5 text-[0.65rem]">
            {runningR.length > 0 && (
              <div style={{ color: "hsl(var(--ok))" }}>
                ● {runningR.length} {runningR.length === 1 ? "active" : "active"}
              </div>
            )}
            {stoppedR.length > 0 && (
              <div className="text-muted-foreground">○ {stoppedR.length} stopped</div>
            )}
          </div>
          <div className="mt-1.5">{summary()}</div>
        </>
      )}
    </div>
  );
}

// ─── Resources by service ─────────────────────────────────────────────────────

function ResourcesByService({
  resources,
  metricsMap,
}: {
  resources: AWSResource[];
  metricsMap: Record<string, AWSMetrics>;
}) {
  const serviceGroups = ALL_SERVICES.map((svc) => ({
    svc,
    items: resources.filter((r) => r.service === svc),
  })).filter(({ items }) => items.length > 0);

  return (
    <div className="mb-6">
      <SectionHeader label="resources" sub={`${resources.length} total`} />
      <div className="space-y-px">
        {serviceGroups.map(({ svc, items }) => (
          <ServiceResourcePanel key={svc} service={svc} resources={items} metricsMap={metricsMap} />
        ))}
      </div>
    </div>
  );
}

function ServiceResourcePanel({
  service,
  resources,
  metricsMap,
}: {
  service: string;
  resources: AWSResource[];
  metricsMap: Record<string, AWSMetrics>;
}) {
  const [open, setOpen] = useState(true);
  const label = SERVICE_LABELS[service] ?? service;

  return (
    <div className="border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-foreground/[0.02]"
      >
        <div className="flex items-center gap-3">
          <span className="text-[0.65rem] uppercase tracking-wider">{label}</span>
          <span className="text-[0.65rem] text-muted-foreground">{resources.length}</span>
        </div>
        <span className="text-[0.65rem] text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-border overflow-x-auto">
          <ServiceTable service={service} resources={resources} metricsMap={metricsMap} />
        </div>
      )}
    </div>
  );
}

function ServiceTable({
  service,
  resources,
  metricsMap,
}: {
  service: string;
  resources: AWSResource[];
  metricsMap: Record<string, AWSMetrics>;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          <th className="px-4 py-2 text-left">name</th>
          <th className="px-4 py-2 text-left">type</th>
          <th className="px-4 py-2 text-left">status</th>
          <th className="px-4 py-2 text-left">region</th>
          <th className="px-4 py-2 text-left">details</th>
          {(service === "ec2" || service === "lambda") && (
            <th className="px-4 py-2 text-left">metrics</th>
          )}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {resources.map((r) => {
          const m = metricsMap[r.id];
          return (
            <tr key={r.id} className="hover:bg-foreground/[0.02]">
              <td className="px-4 py-2.5 max-w-[220px] truncate font-mono text-xs">{r.name}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{r.type}</td>
              <td className="px-4 py-2.5">
                <span className="flex items-center gap-1.5">
                  <StatusDot status={r.status} />
                  {r.status}
                </span>
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{r.region}</td>
              <td className="px-4 py-2.5">
                <ResourceDetails resource={r} />
              </td>
              {(service === "ec2" || service === "lambda") && (
                <td className="px-4 py-2.5">
                  <InlineMetrics m={m} service={service} />
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Cost breakdown ───────────────────────────────────────────────────────────

function CostSection({ cost }: { cost: AWSCostData }) {
  const top = cost.byService.slice(0, 12);
  const chartData = top.map((s) => ({
    name: s.service.replace("Amazon ", "").replace("AWS ", "").slice(0, 20),
    cost: s.cost,
  }));

  return (
    <div className="mb-6 border border-border">
      <header className="flex items-baseline justify-between border-b border-border px-4 py-2 text-[0.65rem] uppercase tracking-wider">
        <span>[ billing ]</span>
        <span>
          {fmtCurrency(cost.totalCost)} / 30 days · {fmtCurrency(cost.dailyCost)}/day
          <span className="ml-2 normal-case text-muted-foreground">
            {cost.periodStart} → {cost.periodEnd}
          </span>
        </span>
      </header>
      <div className="grid md:grid-cols-[1fr_280px]">
        <div className="h-56 px-2 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 32, left: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fontFamily: "var(--font-mono)" }}
                stroke="hsl(var(--muted))"
                angle={-30}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 9, fontFamily: "var(--font-mono)" }}
                stroke="hsl(var(--muted))"
                tickFormatter={(v) => `$${v}`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--bg))",
                  border: "1px solid hsl(var(--fg))",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                }}
                formatter={(v: number) => [fmtCurrency(v), "30-day cost"]}
              />
              <Bar dataKey="cost" fill="hsl(var(--fg))" radius={0} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="border-l border-border px-4 py-4">
          <h4 className="mb-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            by service
          </h4>
          <ul className="space-y-1 text-xs">
            {top.map((s) => (
              <li key={s.service} className="flex justify-between gap-2">
                <span className="truncate text-foreground/80">
                  {s.service.replace("Amazon ", "").replace("AWS ", "")}
                </span>
                <span className="shrink-0 tabular-nums">{fmtCurrency(s.cost)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── CloudWatch metrics ───────────────────────────────────────────────────────

function MetricsSection({ metrics }: { metrics: AWSMetrics[] }) {
  return (
    <div className="mb-6 border border-border">
      <header className="border-b border-border px-4 py-2 text-[0.65rem] uppercase tracking-wider">
        [ cloudwatch metrics ]
      </header>
      <div className="grid gap-px md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.resourceId} className="px-4 py-3">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span
                className="text-xs font-mono truncate max-w-[140px]"
                title={m.resourceId}
              >
                {m.resourceId.split(":").pop() ?? m.resourceId}
              </span>
              <span className="text-[0.65rem] uppercase text-muted-foreground ml-2">
                {SERVICE_LABELS[m.service] ?? m.service}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[0.65rem]">
              {m.cpu !== undefined && (
                <MetricRow label="cpu" value={`${m.cpu.toFixed(1)}%`} warn={m.cpu > 80} />
              )}
              {m.memory !== undefined && (
                <MetricRow label="mem" value={`${m.memory.toFixed(1)}%`} warn={m.memory > 80} />
              )}
              {m.invocations !== undefined && (
                <MetricRow label="inv" value={m.invocations.toLocaleString()} />
              )}
              {m.errors !== undefined && (
                <MetricRow label="err" value={String(m.errors)} warn={m.errors > 0} />
              )}
              {m.latencyMs !== undefined && (
                <MetricRow label="p50" value={`${m.latencyMs.toFixed(0)}ms`} />
              )}
              {m.networkIn !== undefined && (
                <MetricRow label="net↓" value={`${(m.networkIn / 1024).toFixed(0)}kb`} />
              )}
            </div>
            <div className="mt-1 text-[0.6rem] text-muted-foreground">
              {new Date(m.collectedAt).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="uppercase text-muted-foreground">{label}</span>
      <span style={warn ? { color: "hsl(var(--warn))" } : undefined}>{value}</span>
    </div>
  );
}

// ─── Inline metrics (resource table) ─────────────────────────────────────────

function InlineMetrics({ m, service }: { m?: AWSMetrics; service: string }) {
  if (!m) return <span className="text-muted-foreground">—</span>;

  if (service === "ec2") {
    return (
      <span className="flex gap-2 tabular-nums">
        {m.cpu !== undefined && (
          <span>
            <span className="text-muted-foreground">cpu </span>
            {m.cpu.toFixed(1)}%
          </span>
        )}
        {m.networkIn !== undefined && (
          <span>
            <span className="text-muted-foreground">net </span>
            {(m.networkIn / 1024).toFixed(0)}kb
          </span>
        )}
      </span>
    );
  }
  if (service === "lambda") {
    return (
      <span className="flex gap-2 tabular-nums">
        {m.invocations !== undefined && (
          <span>
            <span className="text-muted-foreground">inv </span>
            {m.invocations.toLocaleString()}
          </span>
        )}
        {m.errors !== undefined && (
          <span style={{ color: m.errors > 0 ? "hsl(var(--err))" : undefined }}>
            <span className="text-muted-foreground">err </span>
            {m.errors}
          </span>
        )}
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

// ─── Resource detail cell ─────────────────────────────────────────────────────

function ResourceDetails({ resource }: { resource: AWSResource }) {
  const meta = resource.metadata;
  const pairs: string[] = [];

  if (resource.service === "ec2") {
    if (meta.publicIp) pairs.push(`ip: ${meta.publicIp}`);
    else if (meta.privateIp) pairs.push(`pvt: ${meta.privateIp}`);
    if (meta.platform) pairs.push(String(meta.platform));
    if (meta.availabilityZone) pairs.push(String(meta.availabilityZone));
  } else if (resource.service === "lambda") {
    if (meta.memorySize) pairs.push(`${meta.memorySize}MB`);
    if (meta.timeout) pairs.push(`${meta.timeout}s timeout`);
    if (meta.architecture) pairs.push(String(meta.architecture));
  } else if (resource.service === "rds") {
    if (meta.engine) pairs.push(`${meta.engine} ${meta.engineVersion ?? ""}`.trim());
    if (meta.storageGb) pairs.push(`${meta.storageGb}GB`);
    if (meta.multiAZ) pairs.push("multi-az");
    if (meta.endpoint) pairs.push(String(meta.endpoint));
  } else if (resource.service === "s3") {
    if (meta.region) pairs.push(String(meta.region));
    if (meta.creationDate) pairs.push(new Date(String(meta.creationDate)).toLocaleDateString());
  } else if (resource.service === "ecs") {
    if (meta.runningTasks != null) pairs.push(`${meta.runningTasks} tasks`);
    if (meta.runningCount != null) pairs.push(`${meta.runningCount}/${meta.desiredCount} running`);
    if (meta.cluster) pairs.push(String(meta.cluster));
  } else if (resource.service === "dynamodb") {
    if (meta.itemCount != null) pairs.push(`${Number(meta.itemCount).toLocaleString()} items`);
    if (meta.sizeBytes != null)
      pairs.push(`${(Number(meta.sizeBytes) / 1024).toFixed(1)}KB`);
    if (meta.billingMode) pairs.push(String(meta.billingMode).toLowerCase());
  } else if (resource.service === "sqs") {
    if (meta.messageCount != null) pairs.push(`${meta.messageCount} msgs`);
    if (meta.inFlightCount != null && Number(meta.inFlightCount) > 0)
      pairs.push(`${meta.inFlightCount} in-flight`);
  } else if (resource.service === "elasticache") {
    if (meta.engine) pairs.push(`${meta.engine} ${meta.engineVersion ?? ""}`.trim());
    if (meta.numNodes) pairs.push(`${meta.numNodes} nodes`);
    if (meta.nodeType) pairs.push(String(meta.nodeType));
  }

  if (pairs.length === 0) return <span className="text-muted-foreground">—</span>;
  return <span className="text-muted-foreground">{pairs.join(" · ")}</span>;
}

// ─── Scan log ─────────────────────────────────────────────────────────────────

function ScanLogSection({
  log,
  phase,
  open,
  onToggle,
}: {
  log: ScanLogEntry[];
  phase: Phase;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-border">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-foreground/[0.02]"
      >
        <span className="text-[0.65rem] uppercase tracking-wider">
          [ scan log ]
          {phase === "scanning" && (
            <span className="ml-2 text-muted-foreground">
              <span className="caret" />
            </span>
          )}
        </span>
        <span className="text-[0.65rem] text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-border max-h-48 overflow-y-auto px-4 py-2 font-mono text-[0.65rem]">
          {log.map((entry, i) => (
            <div key={i} className="py-0.5 text-muted-foreground">
              <span>{entry.service}</span>
              <span className="mx-1">›</span>
              {entry.msg}
            </div>
          ))}
          {phase === "done" && log.length > 0 && (
            <div className="py-0.5 text-muted-foreground">— scan complete —</div>
          )}
        </div>
      )}
    </div>
  );
}
