/** Time helpers kept out of render bodies (React purity rules). */
export function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600_000);
}
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86400_000);
}
