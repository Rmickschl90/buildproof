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

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          <article
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 18,
              padding: 22,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: "#16a34a",
                }}
              />

              <h2
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 950,
                  letterSpacing: "-0.03em",
                }}
              >
                Live Timeline
              </h2>
            </div>

            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                color: "#475569",
                display: "grid",
                gap: 10,
                lineHeight: 1.7,
              }}
            >
              <li>Updates as the project progresses</li>
              <li>New entries appear over time</li>
              <li>Approvals update as statuses change</li>
              <li>Useful for ongoing client communication</li>
            </ul>
          </article>

          <article
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 18,
              padding: 22,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: "#2563eb",
                }}
              />

              <h2
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 950,
                  letterSpacing: "-0.03em",
                }}
              >
                Sent Snapshot
              </h2>
            </div>

            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                color: "#475569",
                display: "grid",
                gap: 10,
                lineHeight: 1.7,
              }}
            >
              <li>Frozen at the moment an update is sent</li>
              <li>Includes finalized records only</li>
              <li>Preserves historical communication state</li>
              <li>Used for PDFs and dispute exports</li>
            </ul>
          </article>
        </section>

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

            <WorkflowRow
              items={[
                "Create project",
                "Add entries",
                "Attach files",
                "Send updates",
              ]}
            />
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

            <WorkflowRow
              items={[
                "Draft",
                "Finalized",
                "Sent Snapshot",
              ]}
            />

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <Badge label="Draft" color="#f59e0b" />
              <Badge label="Finalized" color="#2563eb" />
              <Badge label="Sent" color="#16a34a" />
            </div>
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

            <WorkflowRow
              items={[
                "Offline",
                "Queued",
                "Reconnected",
                "Synced",
              ]}
            />
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

            <WorkflowRow
              items={[
                "Draft",
                "Pending",
                "Approved / Declined",
              ]}
            />

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <Badge label="Pending" color="#f59e0b" />
              <Badge label="Approved" color="#16a34a" />
              <Badge label="Declined" color="#dc2626" />
            </div>
          </HelpCard>

          <HelpCard title="5. Project records and documentation">
            <p>
              BuildProof preserves structured project records designed to remain
              clear and understandable later.
            </p>

            <div
              style={{
                display: "grid",
                gap: 10,
                marginTop: 4,
              }}
            >
              <RecordItem
                title="Timestamps"
                text="Timeline records preserve original event times to help maintain a reliable project history."
              />

              <RecordItem
                title="Delivery & View History"
                text="Sent updates preserve delivery records and project view activity tied to that communication."
              />

              <RecordItem
                title="Approval History"
                text="Approval workflows preserve sent, viewed, approved, declined, and expired states."
              />

              <RecordItem
                title="Integrity Hashes"
                text="Exports include integrity verification data intended to help preserve confidence in project records over time."
              />

              <RecordItem
                title="PDF & Dispute Exports"
                text="Structured exports are designed to provide a clean historical project record when documentation needs to be reviewed later."
              />
            </div>
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

function WorkflowRow({
  items,
}: {
  items: string[];
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        marginTop: 4,
      }}
    >
      {items.map((item, index) => (
        <div
          key={item}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              background: "#eff6ff",
              color: "#1d4ed8",
              border: "1px solid #bfdbfe",
              borderRadius: 999,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {item}
          </div>

          {index !== items.length - 1 && (
            <span
              style={{
                color: "#94a3b8",
                fontWeight: 900,
              }}
            >
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Badge({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: `${color}14`,
        border: `1px solid ${color}33`,
        color,
        borderRadius: 999,
        padding: "6px 12px",
        fontSize: 12,
        fontWeight: 900,
      }}
    >
      {label}
    </div>
  );
}

function RecordItem({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div
      style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <strong>{title}</strong>

      <div style={{ marginTop: 4 }}>
        {text}
      </div>
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
};