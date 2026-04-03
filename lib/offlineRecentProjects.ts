export type RecentProject = {
  id: string;
  title: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  project_address: string | null;
  lastOpenedAt: string;
};

const KEY = "buildproof-recent-projects";
const MAX_RECENT = 10;

function read(): RecentProject[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentProject[];
  } catch {
    return [];
  }
}

function write(list: RecentProject[]) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export function saveRecentProject(project: {
  id: string;
  title: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  project_address: string | null;
}) {
  const existing = read();

  const withoutCurrent = existing.filter((p) => p.id !== project.id);

  const next: RecentProject[] = [
    {
      ...project,
      lastOpenedAt: new Date().toISOString(),
    },
    ...withoutCurrent,
  ].slice(0, MAX_RECENT);

  write(next);
}

export function getRecentProjects(): RecentProject[] {
  return read();
}