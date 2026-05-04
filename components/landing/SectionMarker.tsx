/**
 * Small numbered figure marker in the editorial-tech style:
 *
 *   [ fig. 02 · pipeline ]
 *
 * Mirrors a magazine plate caption. Used at the top of every section
 * for hierarchy + a recurring rhythm.
 */
export function SectionMarker({
  fig,
  label,
}: {
  fig: string;
  label: string;
}) {
  return (
    <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
      [ fig. {fig} · {label} ]
    </p>
  );
}
