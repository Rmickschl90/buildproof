export const dynamic = "force-dynamic";

export default function HelpPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
        color: "#0f172a",
        padding: "24px 16px 48px",
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          display: "grid",
          gap: 18,
        }}
      >
        <header
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            padding: 22,
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
          }}
        >
          <a
            href="/dashboard"
            style={{
              display: "inline-flex",
              marginBottom: 16,
              color: "#2563eb",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            ← Back to dashboard
          </a>

          <p
            style={{
              margin: "0 0 8px",
              fontSize: 13,
              fontWeight: 900,
              color: "#2563eb",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            BuildProof Help
          </p>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              lineHeight: 1.08,
              fontWeight: 950,
              letterSpacing: "-0.04em",
            }}
          >
            A simple guide to documenting work clearly.
          </h1>

          <p
            style={{
              margin: "12px 0 0",
              color: "#475569",
              fontSize: 16,
              lineHeight: 1.6,
              maxWidth: 760,
            }}
          >
            BuildProof helps you keep a clean project timeline, send clear
            updates, track approvals, and preserve a reliable record if
            questions come up later.
          </p>
        </header>

        <section style={gridStyle}>
          <HelpCard title="1. How BuildProof works">
            <p>
              Each project has a timeline. Add entries as work happens, attach
              photos or files, and keep client information in one place.
            </p>
            <p>
              A live share link can update as the project progresses. Sent
              updates create a fixed record of what was shared at that time.
            </p>
          </HelpCard>

          <HelpCard title="2. Drafts vs. finalized updates">
            <p>
              Draft entries and draft approvals are internal. They are visible
              on your dashboard while you are still working.
            </p>
            <p>
              When you send an update, selected entries become finalized and are
              preserved as part of that sent record.
            </p>
          </HelpCard>

          <HelpCard title="3. Working offline">
            <p>
              BuildProof is designed for real jobsites. If service drops, you
              can keep adding projects, entries, photos, approvals, and notes.
            </p>
            <p>
              Offline work is saved on your device and syncs when your
              connection returns.
            </p>
          </HelpCard>

          <HelpCard title="4. Approvals">
            <p>
              Approvals are for decisions, changes, costs, schedule changes, or
              anything that needs a clear yes-or-no response.
            </p>
            <p>
              Approval status moves from draft to pending, then approved,
              declined, or expired.
            </p>
          </HelpCard>

          <HelpCard title="5. Project records and dispute packages">
            <p>
              BuildProof keeps a structured record of project activity,
              attachments, approvals, timestamps, and delivery history.
            </p>
            <p>
              PDF exports and dispute packages are meant to provide a clear,
              professional project record — not extra clutter.
            </p>
          </HelpCard>
        </section>
      </div>
    </main>
  );
}

function HelpCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
      }}
    >
      <h2
        style={{
          margin: "0 0 10px",
          fontSize: 20,
          lineHeight: 1.2,
          fontWeight: 900,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h2>

      <div
        style={{
          display: "grid",
          gap: 10,
          color: "#475569",
          fontSize: 15,
          lineHeight: 1.65,
        }}
      >
        {children}
      </div>
    </article>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
};