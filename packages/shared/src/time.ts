/** All workspace dates use Asia/Shanghai, as the old app did. */
export const TIME_ZONE = 'Asia/Shanghai';
export const TIME_ZONE_LABEL = 'Asia/Shanghai (UTC+8)';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const shanghaiDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const shanghaiDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const shanghaiTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** The Asia/Shanghai calendar day of an instant, as YYYY-MM-DD. */
export function shanghaiDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = shanghaiDayFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

export function todayShanghai(now: Date = new Date()): string {
  return shanghaiDay(now) as string;
}

export function isValidDay(day: string): boolean {
  if (!DATE_ONLY.test(day)) return false;
  const [year, month, date] = day.split('-').map(Number);
  if (year === undefined || month === undefined || date === undefined) return false;
  const parsed = new Date(Date.UTC(year, month - 1, date));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === date
  );
}

function dayToUtc(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1));
}

export function addDays(day: string, amount: number): string {
  const date = dayToUtc(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function dayDistance(later: string, earlier: string): number {
  return Math.round((dayToUtc(later).getTime() - dayToUtc(earlier).getTime()) / 86_400_000);
}

export function dayRange(start: string, end: string): string[] {
  if (end < start) return [];
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/** A stable UTC date for a date-only value, so labels never shift by timezone. */
export function dayAsDate(day: string): Date {
  return dayToUtc(day);
}

export function formatDay(
  day: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' },
): string {
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(dayAsDate(day));
}

export function formatDayLong(day: string): string {
  return formatDay(day, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatMonth(day: string): string {
  return formatDay(day, { month: 'long', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return shanghaiDateTimeFormatter.format(date);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return shanghaiTimeFormatter.format(date);
}

export function relativeDays(value: string | null | undefined, today: string): string {
  if (!value) return 'Never';
  const day = shanghaiDay(value);
  if (!day) return 'Unknown';
  const distance = dayDistance(day, today);
  if (distance === 0) return 'Today';
  if (distance === 1) return 'Yesterday';
  if (distance > 1 && distance < 30) return `${distance} days ago`;
  return formatDay(day, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function relativeToNow(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)} d ago`;
  return formatDateTime(value);
}

export function isoNow(): string {
  return new Date().toISOString();
}


/** A future instant, phrased for a "next run" label. */
export function relativeUntil(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  if (seconds <= 0) return 'Due now';
  if (seconds < 60) return 'in <1 min';
  if (seconds < 3600) return `in ${Math.ceil(seconds / 60)} min`;
  if (seconds < 86_400) return `in ${Math.round(seconds / 3600)} h`;
  if (seconds < 7 * 86_400) return `in ${Math.round(seconds / 86_400)} d`;
  return formatDateTime(value);
}
