import type { Run } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';

export function RunsTable({ runs }: { runs: Run[] }) {
  if (runs.length === 0) {
    return <p className="empty">Sin barridos todavía. Corre `pnpm scrape` para el primero.</p>;
  }
  return (
    <table className="runs">
      <thead>
        <tr>
          <th>Fuente</th>
          <th>Cuándo</th>
          <th>Bajadas</th>
          <th>Nuevas</th>
          <th>Resultado</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id}>
            <td>{run.source}</td>
            <td>{timeAgo(run.finishedAt)}</td>
            <td>{run.fetched}</td>
            <td>{run.inserted}</td>
            <td className={run.error !== null ? 'error' : ''}>{run.error ?? 'OK'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
