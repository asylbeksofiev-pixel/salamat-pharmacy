// Opening hours: { mon: ["09:00-21:00"], tue: [...], ..., sun: [] }. Only confirmed schedules are stored.
import { SHOP_TIME_ZONE } from "./format";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type OpeningHours = Partial<Record<Weekday, string[]>>;

const RANGE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-4]):([0-5]\d)$/;

export function parseOpeningHours(value: unknown): OpeningHours | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: OpeningHours = {};
  let any = false;
  for (const day of WEEKDAYS) {
    const ranges = (value as Record<string, unknown>)[day];
    if (ranges === undefined) continue;
    if (!Array.isArray(ranges) || !ranges.every((r) => typeof r === "string" && RANGE.test(r))) return null;
    out[day] = ranges as string[];
    any = true;
  }
  return any ? out : null;
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function localParts(now: Date, timeZone = SHOP_TIME_ZONE): { day: Weekday; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")!.value.toLowerCase().slice(0, 3) as Weekday;
  const h = Number(parts.find((p) => p.type === "hour")!.value);
  const m = Number(parts.find((p) => p.type === "minute")!.value);
  return { day: wd, minute: h * 60 + m };
}

export type OpenStatus = { open: boolean; closesAt?: string; opensAt?: string } | null;

/** Returns null when the schedule is unknown — the UI then shows no Open/Closed badge. */
export function openStatus(hours: OpeningHours | null, now = new Date(), timeZone = SHOP_TIME_ZONE): OpenStatus {
  if (!hours) return null;
  const { day, minute } = localParts(now, timeZone);
  const idx = WEEKDAYS.indexOf(day);
  const prevDay = WEEKDAYS[(idx + 6) % 7];
  // Overnight range from the previous day (e.g. "20:00-02:00").
  for (const r of hours[prevDay] ?? []) {
    const [a, b] = r.split("-");
    if (minutes(b) <= minutes(a) && minute < minutes(b)) return { open: true, closesAt: b };
  }
  for (const r of hours[day] ?? []) {
    const [a, b] = r.split("-");
    const start = minutes(a);
    const end = minutes(b) <= start ? 24 * 60 + minutes(b) : minutes(b);
    if (minute >= start && minute < end) return { open: true, closesAt: b === "24:00" ? "00:00" : b };
  }
  for (let i = 0; i < 7; i++) {
    const d = WEEKDAYS[(idx + i) % 7];
    const next = (hours[d] ?? [])
      .map((r) => r.split("-")[0])
      .filter((a) => i > 0 || minutes(a) > minute)
      .sort()[0];
    if (next) return { open: false, opensAt: next };
  }
  return { open: false };
}
