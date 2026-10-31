/** Silhueta de cada dado, em SVG inline: nada para baixar. */
const SHAPES: Record<number, string> = {
  4: '12,2 23,21 1,21',
  6: '3,3 21,3 21,21 3,21',
  8: '12,1 23,12 12,23 1,12',
  10: '12,1 23,10 12,23 1,10',
  12: '12,1 23,9 19,22 5,22 1,9',
  20: '12,1 22,6.5 22,17.5 12,23 2,17.5 2,6.5',
};

export function DiceIcon({ sides }: { sides: number }) {
  const shape = SHAPES[sides];
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      role="img"
      aria-label={`d${sides}`}
      className="shrink-0 text-crimson-soft"
    >
      <title>{`d${sides}`}</title>
      {shape ? (
        <polygon
          points={shape}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      ) : (
        <circle
          cx={12}
          cy={12}
          r={10.5}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        />
      )}
      <text
        x={12}
        y={sides === 4 ? 18 : 15.5}
        textAnchor="middle"
        fontSize={sides >= 100 ? 7 : 8}
        fill="currentColor"
      >
        {sides}
      </text>
    </svg>
  );
}
