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

/**
 * Découpe un mois en semaines (Lundi→Dimanche) pour un affichage calendrier : chaque semaine est un
 * tableau de 7 cases, `null` pour les jours hors mois en début/fin de semaine. Le nombre de semaines
 * varie selon le mois (4 à 6), pas de padding à un nombre fixe de lignes.
 */
export function weeksInMonth(month: string): (string | null)[][] {
  const days = daysInMonth(month);
  const weeks: (string | null)[][] = [];
  let week: (string | null)[] = [];

  // getUTCDay() renvoie Dimanche=0..Samedi=6 ; on décale pour que la semaine commence Lundi=0.
  const firstWeekday = (new Date(`${days[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
  for (let i = 0; i < firstWeekday; i++) week.push(null);

  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}
