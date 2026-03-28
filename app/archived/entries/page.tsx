"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Project = {
  id: string;
  title: string;
  created_at?: string | null;
};

type Proof = {
  id: number;
  project_id: string;
  content: string;
  created_at: string;
  locked_at: string | null;
  archived_at: string | null;
};

function cleanText(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function formatWhen(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function ArchivedEntriesPage() {
  const router = useRouter();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProofs, setArchivedProofs] = useState<Proof[]>([]);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 180);

  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<
    "archived_newest" | "archived_oldest" | "created_newest" | "created_oldest"
  >("archived_newest");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.push("/login");
        return;
      }

      setUserEmail(data.user.email ?? null);
      await Promise.all([loadProjects(), loadArchivedEntries()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("id,title,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setStatus(`Load projects failed: ${error.message}`);
      return;
    }
    setProjects((data ?? []) as Project[]);
  }

  async function loadArchivedEntries() {
    setStatus("Loading archived entries...");

    // Clean long-term assumption:
    // - proofs table does NOT need user_id (typical schema)
    // - RLS ensures you only see your rows
    const { data, error } = await supabase
      .from("proofs")
      .select("id,project_id,content,created_at,locked_at,archived_at")
      .not("archived_at", "is", null);

    if (error) {
      setStatus(`Load archived entries failed: ${error.message}`);
      return;
    }

    setArchivedProofs((data ?? []) as Proof[]);
    setStatus("");
  }

  async function restoreEntry(proof: Proof) {
    const ok = window.confirm(`Restore entry #${proof.id} back into the active timeline?`);
    if (!ok) return;

    setStatus("Restoring...");
    const { error } = await supabase.from("proofs").update({ archived_at: null }).eq("id", proof.id);

    if (error) {
      setStatus(`Restore failed: ${error.message}`);
      return;
    }

    setArchivedProofs((list) => list.filter((p) => p.id !== proof.id));
    setStatus("Restored ✅");
  }

  async function deleteEntryPermanently(proof: Proof) {
  const ok = window.confirm(`Delete entry #${proof.id} permanently? This cannot be undone.`);
  if (!ok) return;

  setStatus("Deleting...");

  const res = await fetch("/api/proofs/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proofId: proof.id }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    setStatus(data?.error || "Delete failed");
    return;
  }

  setArchivedProofs((list) => list.filter((p) => p.id !== proof.id));
  setStatus("Deleted ✅");
}

  const projectTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.title || "(Untitled project)");
    return m;
  }, [projects]);

  const filtered = useMemo(() => {
    const q = cleanText(debouncedSearch);

    let list = [...archivedProofs];

    if (projectFilter !== "all") {
      list = list.filter((p) => p.project_id === projectFilter);
    }

    if (q) {
      list = list.filter((p) => {
        const projectTitle = projectTitleById.get(p.project_id) || "";
        const hay = cleanText(
          `${projectTitle} ${p.content} ${p.id} ${p.created_at} ${p.archived_at}`
        );
        return hay.includes(q);
      });
    }

    const by = (a: Proof, b: Proof, field: "archived_at" | "created_at", newest: boolean) => {
      const av = a[field] || "";
      const bv = b[field] || "";
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return newest ? -cmp : cmp;
    };

    if (sortMode === "archived_newest") list.sort((a, b) => by(a, b, "archived_at", true));
    if (sortMode === "archived_oldest") list.sort((a, b) => by(a, b, "archived_at", false));
    if (sortMode === "created_newest") list.sort((a, b) => by(a, b, "created_at", true));
    if (sortMode === "created_oldest") list.sort((a, b) => by(a, b, "created_at", false));

    return list;
  }, [archivedProofs, projectFilter, debouncedSearch, sortMode, projectTitleById]);

  const totalCount = archivedProofs.length;
  const shownCount = filtered.length;

  function clearFilters() {
    setSearch("");
    setProjectFilter("all");
    setSortMode("archived_newest");
  }

  return (
    <div className="container">
      <div className="shell">
        <div className="card">
          <div className="row" style={{ alignItems: "center" }}>
            <h1 className="h1">Archived Entries</h1>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => router.push("/archived")} title="Archived projects">
                Archived projects
              </button>
              <button className="btn btnPrimary" onClick={() => router.push("/dashboard")}>
                Back to dashboard
              </button>
            </div>
          </div>

          <p className="sub">
            Signed in as <b>{userEmail}</b>
          </p>

          {status ? <div className="notice">{status}</div> : null}
        </div>

        <div className="card">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="input"
              placeholder="Search archived entries (project name, text, id)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: "1 1 240px", minWidth: 200 }}
            />

            <select
              className="input"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              style={{ width: 220 }}
              title="Filter by project"
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || "(Untitled)"}
                </option>
              ))}
            </select>

            <select
              className="input"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as any)}
              style={{ width: 220 }}
              title="Sort"
            >
              <option value="archived_newest">Archived: newest</option>
              <option value="archived_oldest">Archived: oldest</option>
              <option value="created_newest">Created: newest</option>
              <option value="created_oldest">Created: oldest</option>
            </select>

            <button className="btn" onClick={clearFilters} title="Reset filters">
              Clear filters
            </button>

            <button className="btn" onClick={loadArchivedEntries} title="Reload from server">
              Refresh
            </button>
          </div>

          <div className="sub" style={{ marginTop: 10, opacity: 0.75 }}>
            Showing <b>{shownCount}</b> of <b>{totalCount}</b> archived entries
          </div>

          <div className="list" style={{ marginTop: 12 }}>
            {filtered.map((p) => {
              const title = projectTitleById.get(p.project_id) || "(Project)";
              const isLocked = !!p.locked_at;

              return (
                <div
                  key={p.id}
                  className="proofItem"
                  style={{
                    border: "1px solid rgba(0,0,0,0.06)",
                    borderRadius: 14,
                    padding: 14,
                    background: "white",
                  }}
                >
                  <div style={{ display: "grid", gap: 8 }}>
                    <div className="sub" style={{ opacity: 0.75 }}>
                      <b>{title}</b> • Entry #{p.id}
                    </div>

                    <div style={{ whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.4 }}>{p.content}</div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <div className="sub" style={{ opacity: 0.75 }}>
                        Created: {formatWhen(p.created_at)}
                      </div>
                      <div className="sub" style={{ opacity: 0.75 }}>
                        Archived: {formatWhen(p.archived_at)}
                      </div>

                      <div
                        style={{
                          marginLeft: "auto",
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: isLocked
                            ? "1px solid rgba(16,185,129,0.35)"
                            : "1px solid rgba(245,158,11,0.35)",
                          background: isLocked ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)",
                          color: isLocked ? "#065f46" : "#92400e",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isLocked ? "Finalized" : "Draft"}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn btnPrimary" onClick={() => restoreEntry(p)}>
                        Restore
                      </button>
                      {!isLocked ? (
                        <button className="btn btnDanger" onClick={() => deleteEntryPermanently(p)}>
                          Delete permanently
                        </button>
                      ) : null}
                      <button className="btn" onClick={() => router.push(`/dashboard?p=${encodeURIComponent(p.project_id)}`)}>
                        Open project
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="sub" style={{ marginTop: 12, opacity: 0.75 }}>
              No archived entries found.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}