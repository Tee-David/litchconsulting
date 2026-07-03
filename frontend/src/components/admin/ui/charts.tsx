/** Lightweight, dependency-free SVG charts for the dashboard. */

export function BarChart({
  data,
  height = 180,
  format = (n: number) => String(n),
}: {
  data: { label: string; value: number }[];
  height?: number;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barW = 100 / (data.length * 1.6);
  const gap = barW * 0.6;

  return (
    <div>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="w-full" style={{ height }}>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2="100" y1={60 * g} y2={60 * g} stroke="var(--color-hairline)" strokeWidth="0.3" />
        ))}
        {data.map((d, i) => {
          const h = (d.value / max) * 52;
          const x = i * (barW + gap) + gap;
          return (
            <rect
              key={i}
              x={x}
              y={58 - h}
              width={barW}
              height={Math.max(h, 0.5)}
              rx="1"
              fill="var(--color-brand)"
              className="dark:[fill:var(--color-highlight)]"
            />
          );
        })}
      </svg>
      <div className="mt-2 flex justify-between text-[11px] text-muted">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  const r = 60;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[200px]">
      <svg viewBox="0 0 160 160" className="size-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-surface)" strokeWidth="18" />
        {segments.map((seg) => {
          const len = (seg.value / total) * c;
          const el = (
            <circle
              key={seg.label}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="18"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue && <span className="font-display text-xl font-bold text-ink">{centerValue}</span>}
          {centerLabel && <span className="max-w-[7rem] text-[11px] text-muted">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}
