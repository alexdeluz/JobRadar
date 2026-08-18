const miles = new Intl.NumberFormat('es-CL');

/** "2.500–3.200 USD" | "desde 2.500 USD" | "hasta 3.200 USD" | null. */
export function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
): string | null {
  const cur = currency ?? '';
  if (min !== null && max !== null) return `${miles.format(min)}–${miles.format(max)} ${cur}`.trim();
  if (min !== null) return `desde ${miles.format(min)} ${cur}`.trim();
  if (max !== null) return `hasta ${miles.format(max)} ${cur}`.trim();
  return null;
}

/** Nivel de señal 1-5 por quintil de score; 0 = sin clasificar. */
export function signalLevel(score: number | null): number {
  if (score === null) return 0;
  return Math.min(5, Math.floor(score / 20) + 1);
}

/** Tiempo relativo en español: "recién", "hace 3 h", "hace 2 días". */
export function timeAgo(iso: string | null, now: Date = new Date()): string | null {
  if (iso === null) return null;
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return 'recién';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}
