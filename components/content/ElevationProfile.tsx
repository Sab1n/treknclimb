'use client';

import { useState, useId } from 'react';

import type { ElevationPointDTO } from '../../types/dto';

const METRES_TO_FEET = 3.28084;

/**
 * The elevation graph, drawn from itinerary day altitudes.
 *
 * Rendered only when the trip has `hasElevationProfile`. A plain inline SVG
 * with a `viewBox`, so it scales to any width without a charting library and
 * without a resize listener.
 *
 * The unit toggle is the reason this is a Client Component: international
 * trekkers read altitude in metres or feet depending on where they are from,
 * and getting the wrong one is a real comprehension barrier on the one number
 * that tells them how hard the trip is.
 */
export default function ElevationProfile({
  points,
  className,
}: {
  points: ElevationPointDTO[];
  className?: string;
}) {
  const [unit, setUnit] = useState<'m' | 'ft'>('m');
  const gradientId = useId();

  if (points.length < 2) return null;

  const width = 800;
  const height = 220;
  const padding = { top: 24, right: 16, bottom: 32, left: 16 };

  const altitudes = points.map((p) => p.altitudeM);
  const min = Math.min(...altitudes);
  const max = Math.max(...altitudes);
  // A flat trek would divide by zero; a 1 m floor keeps the line centred.
  const span = Math.max(max - min, 1);

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const coords = points.map((point, index) => ({
    ...point,
    x: padding.left + (index / (points.length - 1)) * plotWidth,
    y: padding.top + (1 - (point.altitudeM - min) / span) * plotHeight,
  }));

  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${padding.left},${height - padding.bottom} ${line} ${width - padding.right},${height - padding.bottom}`;

  const highest = coords.reduce((a, b) => (b.altitudeM > a.altitudeM ? b : a));

  const format = (metres: number) =>
    unit === 'm'
      ? `${Math.round(metres).toLocaleString('en-US')} m`
      : `${Math.round(metres * METRES_TO_FEET).toLocaleString('en-US')} ft`;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-extrabold tracking-display">
          Altitude by day
        </h2>

        <div
          role="group"
          aria-label="Altitude units"
          className="flex overflow-hidden rounded-full border border-hairline text-xs font-semibold"
        >
          {(['m', 'ft'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setUnit(option)}
              aria-pressed={unit === option}
              className={`px-3 py-1.5 font-mono transition-colors ${
                unit === option
                  ? 'bg-ink text-paper'
                  : 'bg-white text-muted hover:text-ink'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-sm text-muted">
        Highest point {format(highest.altitudeM)} on day {highest.day} —{' '}
        {highest.title}. Flat sections are acclimatisation days.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-hairline bg-white p-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Altitude profile across ${points.length} days, from ${format(min)} to ${format(max)}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0F1A24" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0F1A24" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <polygon points={area} fill={`url(#${gradientId})`} />
          <polyline
            points={line}
            fill="none"
            stroke="#0F1A24"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {coords.map((c) => (
            <circle
              key={c.day}
              cx={c.x}
              cy={c.y}
              r={c.altitudeM === max ? 5 : 3}
              fill={c.altitudeM === max ? '#F0A02A' : '#0F1A24'}
            />
          ))}

          <text
            x={highest.x}
            y={highest.y - 12}
            textAnchor="middle"
            className="fill-ink font-mono text-[13px] font-semibold"
          >
            {format(max)}
          </text>

          <text
            x={padding.left}
            y={height - 8}
            className="fill-muted font-mono text-[12px]"
          >
            Day {coords[0].day}
          </text>
          <text
            x={width - padding.right}
            y={height - 8}
            textAnchor="end"
            className="fill-muted font-mono text-[12px]"
          >
            Day {coords[coords.length - 1].day}
          </text>
        </svg>
      </div>

      {/*
        The SVG is decorative to a screen reader beyond its label, so the same
        data is available as text. Visually hidden, not display:none, so it is
        still in the accessibility tree.
      */}
      <ul className="sr-only">
        {coords.map((c) => (
          <li key={c.day}>
            Day {c.day}, {c.title}: {format(c.altitudeM)}
          </li>
        ))}
      </ul>
    </div>
  );
}
