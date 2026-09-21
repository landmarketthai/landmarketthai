const BANGKOK_DATE_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatBangkokDateTimeLocal(date: Date): string {
  const parts = BANGKOK_DATE_TIME.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function parseBangkokDateTimeLocal(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    throw new Error("Invalid next action date");
  }

  const parsed = new Date(`${trimmed}:00+07:00`);
  if (Number.isNaN(parsed.getTime()) || formatBangkokDateTimeLocal(parsed) !== trimmed) {
    throw new Error("Invalid next action date");
  }

  return parsed.toISOString();
}
