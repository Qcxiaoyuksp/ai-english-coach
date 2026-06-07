// ============================================================
// ProgressTrend — Score-over-time SVG line chart
// ============================================================
// Lightweight, dependency-free line chart for visualizing how the
// overall score (0-100) changes across past practice sessions.
// Mirrors the hand-rolled SVG approach used by RadarChart.
// ============================================================

'use client';

export interface TrendPoint {
  /** Overall score 0-100. */
  score: number;
  /** Short label shown under the x-axis (e.g. a date). */
  label: string;
}

interface ProgressTrendProps {
  points: TrendPoint[];
  width?: number;
  height?: number;
  color?: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export default function ProgressTrend({
  points,
  width = 560,
  height = 220,
  color = '#3b82f6',
}: ProgressTrendProps) {
  if (points.length < 2) return null;

  const padL = 34; // room for y labels
  const padR = 14;
  const padT = 14;
  const padB = 26; // room for x labels

  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const yFor = (score: number) =>
    padT + plotH - (clamp(score, 0, 100) / 100) * plotH;
  const xFor = (i: number) =>
    padL + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1));

  const gridLines = [0, 25, 50, 75, 100];

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.score).toFixed(1)}`)
    .join(' ');

  // Only show a subset of x labels when there are many points, to avoid crowding.
  const labelStep = Math.ceil(points.length / 6);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="成绩随时间变化折线图"
    >
      {/* Horizontal grid + y labels */}
      {gridLines.map((g) => {
        const y = yFor(g);
        return (
          <g key={g}>
            <line
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
            <text
              x={padL - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              fill="rgba(255,255,255,0.5)"
            >
              {g}
            </text>
          </g>
        );
      })}

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Points + x labels */}
      {points.map((p, i) => {
        const x = xFor(i);
        const y = yFor(p.score);
        const showLabel = i % labelStep === 0 || i === points.length - 1;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={3.5} fill={color} />
            <text
              x={x}
              y={y - 9}
              textAnchor="middle"
              fontSize={10}
              fill="rgba(255,255,255,0.75)"
            >
              {p.score}
            </text>
            {showLabel && (
              <text
                x={x}
                y={height - 8}
                textAnchor="middle"
                fontSize={10}
                fill="rgba(255,255,255,0.5)"
              >
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
