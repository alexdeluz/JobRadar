import type { NormalizedJob, SourceName } from '@jobradar/core';

/** Contrato común de todas las fuentes de ofertas. */
export interface JobSource {
  name: SourceName;
  /** Baja y normaliza los listados vigentes, respetando el rate-limit propio. */
  fetchListings(): Promise<NormalizedJob[]>;
}
