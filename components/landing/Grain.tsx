/**
 * Fixed-position SVG noise overlay. Sits above all content but below
 * pointer events; multiplies into the cream background to give the
 * page a subtle paper-grain feel.
 *
 * The CSS class `.grain` does the work; this component just mounts it.
 */
export function Grain() {
  return <div className="grain" aria-hidden />;
}
