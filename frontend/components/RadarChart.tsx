// ============================================================
// RadarChart — Six-dimension SVG radar
// ============================================================
// Lightweight, dependency-free radar chart for visualizing the
// six assessment dimensions (0-100 each).
// ============================================================

'use client';

export interface RadarDatum {
  label: string;
  score: number; // 0-100
}

interface RadarChartProps {
  data: RadarDatum[];
  size?: number;
  /** Stroke/fill accent color. */
  color?: string;
}

function polarToXY(
  cx: number,
  cy: number,
  radius: number,
  angleRad: number
): [number, number] {
  return [cx + radius * Math.cos(angleRad), cy + radius * Math.sin(angleRad)];
}

export default function RadarChart({
  data,
  size = 260,
  color = '#3b82f6',
}: RadarChartProps) {
  const n = data.length;
  if (n < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 38; // leave room for labels
  const rings = [0.25, 0.5, 0.75, 1];
  // Start at the top (-90°) and go clockwise.
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  // Grid rings (polygons)
  const ringPolys = rings.map((r) =>
    data
      .map((_, i) => {
        const [x, y] = polarToXY(cx, cy, maxR * r, angleFor(i));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ')
  );

  // Data polygon
  const dataPoints = data.map((d, i) => {
    const r = (maxR * clamp(d.score, 0, 100)) / 100;
    return polarToXY(cx, cy, r, angleFor(i));
  });
  const dataPoly = dataPoints
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="六维能力雷达图"
    >
      {/* Grid rings */}
      {ringPolys.map((pts, idx) => (
        <polygon
          key={idx}
          points={pts}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
      ))}

      {/* Axes + labels */}
      {data.map((d, i) => {
        const [ax, ay] = polarToXY(cx, cy, maxR, angleFor(i));
        const [lx, ly] = polarToXY(cx, cy, maxR + 18, angleFor(i));
        const anchor =
          Math.abs(lx - cx) < 1 ? 'middle' : lx > cx ? 'start' : 'end';
        return (
          <g key={i}>
            <line
              x1={cx}
              y1={cy}
              x2={ax}
              y2={ay}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
            <text
              x={lx}
              y={ly}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize={11}
              fill="rgba(255,255,255,0.65)"
            >
              {d.label}
            </text>
          </g>
        );
      })}

      {/* Data polygon */}
      <polygon
        points={dataPoly}
        fill={color}
        fillOpacity={0.22}
        stroke={color}
        strokeWidth={2}
        style={{ transition: 'all 0.6s ease' }}
      />
      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill={color} />
      ))}
    </svg>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
