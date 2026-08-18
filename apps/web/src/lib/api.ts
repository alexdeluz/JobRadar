export type JobStatus =
  | 'new'
  | 'reviewed'
  | 'applying'
  | 'applied'
  | 'pending_classification'
  | 'discarded_rules'
  | 'discarded_llm'
  | 'discarded_manual';

export interface Job {
  id: number;
  source: string;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  remote: string | null;
  description: string;
  publishedAt: string | null;
  category: string | null;
  score: number | null;
  reasons: string[];
  redFlags: string[];
  rulesMatched: string[];
  status: JobStatus;
  coverLetter: string | null;
  extraLinks: { source: string; url: string }[];
  createdAt: string;
}

export interface Run {
  id: number;
  source: string;
  startedAt: string;
  finishedAt: string;
  fetched: number;
  inserted: number;
  error: string | null;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export function fetchJobs(params: { status?: string; category?: string } = {}): Promise<Job[]> {
  const query = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined),
  );
  const qs = query.toString();
  return request<{ jobs: Job[] }>(`/api/jobs${qs ? `?${qs}` : ''}`).then((r) => r.jobs);
}

export function fetchRuns(): Promise<Run[]> {
  return request<{ runs: Run[] }>('/api/runs').then((r) => r.runs);
}

export function updateStatus(id: number, status: JobStatus): Promise<void> {
  return request(`/api/jobs/${id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function generateCoverLetter(id: number): Promise<string> {
  return request<{ coverLetter: string }>(`/api/jobs/${id}/cover-letter`, {
    method: 'POST',
  }).then((r) => r.coverLetter);
}
