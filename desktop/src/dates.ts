// Local-calendar helpers for the agenda. Appointments arrive as UTC instants;
// the days, the weeks and the hours shown are those of the doctor's PC.

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// Monday is the first day of the week, as in Algeria.
export const startOfWeek = (date: Date) => {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
};

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const longDay = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const shortDay = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" });
const monthDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const dateOnly = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDateOnly = (iso: string) => dateOnly.format(new Date(iso));

export const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1);

export const formatLongDay = (date: Date) => capitalize(longDay.format(date));
export const formatShortDay = (date: Date) => capitalize(shortDay.format(date));

export function formatWeekRange(start: Date) {
  const end = addDays(start, 6);
  return `${monthDay.format(start)} – ${monthDay.format(end)} ${end.getFullYear()}`;
}
