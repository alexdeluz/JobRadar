import { useState } from 'react';
import { generateCoverLetter, updateStatus, type Job } from '../lib/api.js';
import { formatSalary, signalLevel, timeAgo } from '../lib/format.js';

const SOURCE_LABELS: Record<string, string> = {
  getonbrd: 'Get on Board',
  chiletrabajos: 'Chiletrabajos',
  computrabajo: 'Computrabajo',
};

export function JobCard({ job, onChanged }: { job: Job; onChanged: () => void }) {
  const [cover, setCover] = useState<string | null>(job.coverLetter);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const level = signalLevel(job.score);
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);
  const published = timeAgo(job.publishedAt ?? job.createdAt);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function prepare() {
    setBusy(true);
    setError(null);
    try {
      const letter = await generateCoverLetter(job.id);
      setCover(letter);
      await updateStatus(job.id, 'applying');
      window.open(job.url, '_blank', 'noopener');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="job">
      <div
        className={`signal${level > 0 && level < 4 ? ' mid' : ''}`}
        title={job.score === null ? 'Sin clasificar' : `Score ${job.score}/100`}
      >
        {[1, 2, 3, 4, 5].map((bar) => (
          <i key={bar} className={bar <= level ? 'on' : ''} />
        ))}
        <span className="score">{job.score ?? '·'}</span>
      </div>

      <div>
        <h3>
          <a href={job.url} target="_blank" rel="noreferrer">
            {job.title}
          </a>
        </h3>
        <div className="line">
          {job.company !== null && <span>{job.company}</span>}
          {salary !== null && <span className="salary">{salary}</span>}
          {job.remote !== null && <span>{job.remote}</span>}
          {job.location !== null && <span>{job.location}</span>}
          <span>{SOURCE_LABELS[job.source] ?? job.source}</span>
          {published !== null && <span>{published}</span>}
          <span className={`status-chip ${job.status}`}>{job.status}</span>
        </div>

        {(job.reasons.length > 0 || job.redFlags.length > 0) && (
          <ul className="reasons">
            {job.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {job.redFlags.map((flag) => (
              <li key={flag} className="flag">
                {flag}
              </li>
            ))}
          </ul>
        )}

        <div className="actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() => void prepare()}
            title="Genera la carta y abre la oferta para postular"
          >
            Preparar postulación
          </button>
          {job.status !== 'applied' && (
            <button disabled={busy} onClick={() => void act(() => updateStatus(job.id, 'applied'))}>
              Marcar postulada
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => void act(() => updateStatus(job.id, 'discarded_manual'))}
          >
            Descartar
          </button>
          {job.extraLinks.map((link) => (
            <a key={link.url} className="btn" href={link.url} target="_blank" rel="noreferrer">
              Ver en {SOURCE_LABELS[link.source] ?? link.source}
            </a>
          ))}
        </div>

        {error !== null && <p className="reasons flag">{error}</p>}
        {cover !== null && <div className="cover">{cover}</div>}
      </div>
    </article>
  );
}
