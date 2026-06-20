/**
 * Numbers strip — the kind of hard data line that anchors a marketing
 * page. Big mono numerals, small uppercase labels, tight spacing.
 */

const STATS = [
  { numeral: "47", label: "cloud agents · aws + gcp" },
  { numeral: "11", label: "specialist analysis agents" },
  { numeral: "0", label: "long-lived secrets stored" },
  { numeral: "1×", label: "terraform apply per deploy" },
];

export function StatStrip() {
  return (
    <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
      {STATS.map((s) => (
        <div key={s.label} className="bg-cream p-6 md:p-8">
          <p className="numeral text-5xl md:text-6xl">{s.numeral}</p>
          <p className="mt-3 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
            {s.label}
          </p>
        </div>
      ))}
    </div>
  );
}
