const MAX_AGE_HOURS = 12;

/**
 * ¿Corresponde un barrido? Sí cuando nunca hubo uno o el último terminó hace
 * más de 12 horas: permite usar la app una vez en la mañana y otra en la
 * noche con barrido fresco en ambas, sin scrapear en cada arranque.
 */
export function needsScrape(lastFinishedAt: string | null, now: Date = new Date()): boolean {
  if (lastFinishedAt === null) return true;
  const ageHours = (now.getTime() - new Date(lastFinishedAt).getTime()) / 3_600_000;
  return ageHours > MAX_AGE_HOURS;
}
