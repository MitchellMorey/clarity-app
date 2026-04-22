export function ScoreBar({
  score,
  width = "w-[100px]",
}: {
  score: number;
  width?: string;
}) {
  const color =
    score >= 85
      ? "bg-emerald-500"
      : score >= 70
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <div
      className={`${width} h-1.5 overflow-hidden rounded-full border border-border bg-surface-alt`}
    >
      <div
        className={`h-full ${color}`}
        style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
      />
    </div>
  );
}
