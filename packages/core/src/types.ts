/** Identificador de cada portal soportado. */
export type SourceName = 'getonbrd' | 'chiletrabajos' | 'computrabajo';

export type RemoteModality = 'remote' | 'hybrid' | 'onsite';

/**
 * Oferta ya normalizada al modelo común, independiente del portal de origen.
 */
export interface NormalizedJob {
  /** Identificador de la oferta dentro de su portal. */
  sourceId: string;
  source: SourceName;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  /** Código ISO de la moneda del salario (p. ej. 'USD', 'CLP'). */
  salaryCurrency: string | null;
  remote: RemoteModality | null;
  /** Descripción en texto plano (sin HTML). */
  description: string;
  /** Fecha de publicación en ISO 8601, si el portal la expone. */
  publishedAt: string | null;
  /** Hash de título+empresa normalizados, para dedup entre portales. */
  fingerprint: string;
}

/** Categorías de clasificación según el perfil del usuario. */
export type JobCategory = 'dotnet' | 'js_transition' | 'discard';

export type JobStatus =
  | 'new'
  | 'reviewed'
  | 'applying'
  | 'applied'
  | 'pending_classification'
  | 'discarded_rules'
  | 'discarded_llm'
  | 'discarded_manual';

/** Resultado del filtro determinista por keywords, previo al LLM. */
export interface RulesVerdict {
  passed: boolean;
  /** Keywords que motivaron la decisión (para auditoría en el dashboard). */
  matched: string[];
}

/** Resultado de la clasificación con LLM. */
export interface Classification {
  category: JobCategory;
  /** 0–100: qué tan buen match es contra el perfil. */
  score: number;
  reasons: string[];
  redFlags: string[];
}
