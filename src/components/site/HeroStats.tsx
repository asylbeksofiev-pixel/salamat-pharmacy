import { cn } from "../ui/cn";

interface HeroStat {
  term: string;
  value: number | string;
  grouping?: boolean;
  caption: string;
}

export function HeroStats({ stats, locale, className }: { stats: HeroStat[]; locale: string; className?: string }) {
  return (
    <dl className={cn("sal-hero-stats grid grid-cols-3 gap-3", className)}>
      {stats.map(({ term, value, grouping, caption }) => (
        <div key={term} className="rounded-[var(--radius-lg)] bg-white p-3 shadow-[var(--shadow-card)]">
          <dt className="sr-only">{term}</dt>
          <dd className="text-2xl font-extrabold text-brand-700 tabular-nums">
            {typeof value === "number" ? value.toLocaleString(locale, { useGrouping: grouping !== false }) : value}
          </dd>
          <dd className="text-xs leading-tight text-muted">{caption}</dd>
        </div>
      ))}
    </dl>
  );
}
