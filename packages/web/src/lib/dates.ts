export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function currentMonth(): string {
  return today().slice(0, 7);
}

export function daysInMonth(month: string): string[] {
  const [year, monthIndex] = month.split("-").map(Number);
  const count = new Date(year, monthIndex, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

const WEEKDAY_LETTERS = ["D", "L", "M", "M", "J", "V", "S"];

export function weekdayLetter(dateStr: string): string {
  return WEEKDAY_LETTERS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

export function isWeekend(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}
