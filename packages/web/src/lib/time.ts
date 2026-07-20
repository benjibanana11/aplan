export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** "08:00" -> "8h", "08:30" -> "8h30" */
export function formatTimeCompact(time: string): string {
  const [hours, minutes] = time.split(":");
  return minutes === "00" ? `${Number(hours)}h` : `${Number(hours)}h${minutes}`;
}
