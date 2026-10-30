const formatter = new Intl.RelativeTimeFormat("fr", { numeric: "auto", style: "short" });

// "il y a 12 min", "il y a 3 h", "hier"… ; "jamais" without a date.
export function relativeTime(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) return "jamais";
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return "jamais";
  const seconds = Math.round((at - now) / 1000);
  if (Math.abs(seconds) < 45) return "à l’instant";
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}
