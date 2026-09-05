const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayLocal(now = new Date()) {
  return formatLocalDate(now);
}

export function parseLocalDate(value: string) {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) throw new Error('INVALID_LOCAL_DATE');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  )
    throw new Error('INVALID_LOCAL_DATE');
  return date;
}

export function addLocalDays(value: string | Date, amount: number) {
  const date =
    typeof value === 'string'
      ? parseLocalDate(value)
      : new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  date.setDate(date.getDate() + amount);
  return formatLocalDate(date);
}

export function startOfLocalWeek(now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return formatLocalDate(date);
}
