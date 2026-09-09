import type { RiskLevel } from '@concord/shared';

const COLOR: Record<RiskLevel, string> = {
  low: 'var(--low)',
  medium: 'var(--med)',
  high: 'var(--high)',
};

export default function RiskGauge({
  score,
  level,
}: {
  score: number;
  level: RiskLevel;
}) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = COLOR[level];

  return (
    <div style={{ position: 'relative', width: 106, height: 106, flex: 'none' }}>
      <svg width={106} height={106} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={53} cy={53} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={9} />
        <circle
          cx={53}
          cy={53}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: 1, color }}>
          {score}
        </b>
        <span
          style={{
            fontSize: 9,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            marginTop: 3,
          }}
        >
          {level} risk
        </span>
      </div>
    </div>
  );
}
