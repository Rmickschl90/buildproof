"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Project = {
  id: string;
  title: string;
  user_id: string;
  client_name: string | null;
  client_email: string | null;
  archived_at: string | null;
};

export default function ArchivedPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"archived_newest" | "archived_oldest" | "az">("archived_newest");

  const hasProjects = projects.length > 0;

  const sortedProjects = useMemo(() => {
    let list = [...projects];

    // search filter
    const q = search.trim().toLowerCase();
    if (q) {
  list = list.filter((p) => {
    const haystack = `${p.title || ""} ${p.client_name || ""} ${p.client_email || ""}`
      .toLowerCase();

    return haystack.includes(q);
  });
}

    // sorting
    if (sortMode === "az") {
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else {
      list.sort((a, b) => {
        const ad = a.archived_at ? new Date(a.archived_at).getTime() : 0;
        const bd = b.archived_at ? new Date(b.archived_at).getTime() : 0;

        if (sortMode === "archived_newest") return bd - ad;
        if (sortMode === "archived_oldest") return ad - bd;

        return 0;
      });
    }

    return list;
  }, [projects, search, sortMode]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.push("/login");
        return;
      }
      await loadArchived(data.user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadArchived(uid: string) {
    const { data, error } = await supabase
      .from("projects")
      .select("id,title,user_id,client_name,client_email,archived_at")
      .eq("user_id", uid)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });

    if (error) {
      setStatus(`Load failed: ${error.message}`);
      return;
    }

    setProjects((data ?? []) as Project[]);
    setStatus("");
  }

  async function restoreProject(p: Project) {
    const ok = window.confirm(`Restore "${p.title}"?`);
    if (!ok) return;

    try {
      setRestoringId(p.id);
      setStatus("Restoring...");

      const { error } = await supabase.from("projects").update({ archived_at: null }).eq("id", p.id);
      if (error) throw error;

      setProjects((list) => list.filter((x) => x.id !== p.id));
      setStatus("Project restored ✅");
    } catch (e: any) {
      setStatus(e?.message ?? "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="container">
      <div className="shell">
        {/* Header card */}
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div className="row" style={{ alignItems: "center" }}>
            <div style={{ display: "grid", gap: 2 }}>
              <h1 className="h1" style={{ margin: 0 }}>
                Archived Projects
              </h1>
              <div className="sub" style={{ opacity: 0.7 }}>
                Restore a project to bring it back to your dashboard.
              </div>
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
              

              <button className="btn btnPrimary" onClick={() => router.push("/dashboard")} title="Back to dashboard">
                Back to Dashboard
              </button>
            </div>
          </div>

          {status && <div className="notice">{status}</div>}
        </div>

        {/* Content card */}
        <div className="card">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input
              className="input"
              placeholder="Search project name, client, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: "1 1 220px", minWidth: 180 }}
            />

            <select
              className="input"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as "archived_newest" | "archived_oldest" | "az")}
              style={{ width: 200 }}
              title="Sort archived projects"
            >
              <option value="archived_newest">Archived: newest</option>
              <option value="archived_oldest">Archived: oldest</option>
              <option value="az">A–Z</option>
            </select>
          </div>
          <div className="sub" style={{ marginBottom: 12, opacity: 0.75 }}>
            Showing <b>{sortedProjects.length}</b> of <b>{projects.length}</b> archived projects
          </div>
          {sortedProjects.length === 0 ? (
            <div className="sub" style={{ opacity: 0.7 }}>
              {projects.length === 0 ? "No archived projects." : "No archived projects match your search."}
            </div>
          ) : (
            <div className="list" style={{ display: "grid", gap: 10 }}>
              {sortedProjects.map((p) => {
                const archivedLabel = p.archived_at ? new Date(p.archived_at).toLocaleDateString() : "";
                const isRestoring = restoringId === p.id;

                return (
                  <div
                    key={p.id}
                    className="row"
                    style={{
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 14,
                      padding: 14,
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      transition: "transform 120ms ease, box-shadow 120ms ease",
                      boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 10px 24px rgba(0,0,0,0.06)";
                      (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 0 rgba(0,0,0,0.03)";
                      (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 750,
                          lineHeight: 1.2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={p.title}
                      >
                        {p.title}
                      </div>

                      {p.client_name || p.client_email ? (
                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.75,
                            marginTop: 4,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={[p.client_name, p.client_email].filter(Boolean).join(" • ")}
                        >
                          {[p.client_name, p.client_email].filter(Boolean).join(" • ")}
                        </div>
                      ) : null}

                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        Archived on {archivedLabel}
                      </div>
                    </div>

                    <button
                      className="btn btnPrimary"
                      onClick={() => restoreProject(p)}
                      disabled={isRestoring}
                      aria-busy={isRestoring}
                      style={{
                        opacity: isRestoring ? 0.7 : 1,
                        transition: "opacity 120ms ease",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isRestoring ? "Restoring…" : "Restore"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}