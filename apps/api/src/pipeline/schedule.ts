const MAX_AGE_HOURS = 20;

/**
 * ¿Corresponde un barrido? Sí cuando nunca hubo uno o el último terminó hace
 * más de 20 horas (catch-up para PCs que estuvieron apagados a la hora agendada).
 */
export function needsScrape(lastFinishedAt: string | null, now: Date = new Date()): boolean {
  if (lastFinishedAt === null) return true;
  const ageHours = (now.getTime() - new Date(lastFinishedAt).getTime()) / 3_600_000;
  return ageHours > MAX_AGE_HOURS;
}
