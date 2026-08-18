import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchJobs, fetchRuns, type Job, type Run } from './lib/api.js';
import { JobCard } from './components/JobCard.js';
import { RunsTable } from './components/RunsTable.js';

type TabId = 'dotnet' | 'js_transition' | 'pending' | 'discarded' | 'applied' | 'runs';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dotnet', label: '.NET' },
  { id: 'js_transition', label: 'JS transición' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'applied', label: 'Postuladas' },
  { id: 'discarded', label: 'Descartadas' },
  { id: 'runs', label: 'Runs' },
];

function belongsTo(job: Job, tab: TabId): boolean {
  switch (tab) {
    case 'dotnet':
    case 'js_transition':
      return (
        job.category === tab && !['applied', 'discarded_manual', 'applying'].includes(job.status)
      );
    case 'pending':
      return job.status === 'pending_classification';
    case 'applied':
      return job.status === 'applied' || job.status === 'applying';
    case 'discarded':
      return job.status.startsWith('discarded');
    case 'runs':
      return false;
  }
}

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [tab, setTab] = useState<TabId>('dotnet');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([fetchJobs(), fetchRuns()])
      .then(([j, r]) => {
        setJobs(j);
        setRuns(r);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(reload, [reload]);

  const counts = useMemo(() => {
    const map = new Map<TabId, number>();
    for (const { id } of TABS) {
      if (id !== 'runs') map.set(id, jobs.filter((job) => belongsTo(job, id)).length);
    }
    return map;
  }, [jobs]);

  const visible = jobs.filter((job) => belongsTo(job, tab));
  const lastRun = runs[0];

  return (
    <div className="shell">
      <header className="masthead">
        <h1>
          Job Radar<span className="dot">.</span>
        </h1>
        <span className="meta">
          {lastRun !== undefined
            ? `último barrido: ${new Date(lastRun.finishedAt).toLocaleString('es-CL')}`
            : 'sin barridos'}
        </span>
      </header>

      <nav className="tabs">
        {TABS.map(({ id, label }) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
            {counts.has(id) && <span className="count">{counts.get(id)}</span>}
          </button>
        ))}
      </nav>

      {error !== null && (
        <p className="empty">No pude cargar datos: {error}. ¿Está corriendo la API?</p>
      )}

      {tab === 'runs' ? (
        <RunsTable runs={runs} />
      ) : visible.length === 0 ? (
        <p className="empty">Nada en esta bandeja.</p>
      ) : (
        visible.map((job) => <JobCard key={job.id} job={job} onChanged={reload} />)
      )}
    </div>
  );
}
