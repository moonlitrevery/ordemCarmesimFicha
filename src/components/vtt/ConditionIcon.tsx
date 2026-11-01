import type { ResolvedCondition } from '@/lib/vtt/conditions';

/** O mesmo traço que vai para o canvas (`engine/marker-art.ts`). */
export function ConditionIcon({
  condition,
  size = 16,
}: {
  condition: Pick<ResolvedCondition, 'path' | 'emoji'>;
  size?: number;
}) {
  if (condition.emoji) {
    return (
      <span
        aria-hidden
        className="inline-block shrink-0 text-center leading-none"
        style={{ width: size, fontSize: size - 2 }}
      >
        {condition.emoji}
      </span>
    );
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={condition.path} />
    </svg>
  );
}
