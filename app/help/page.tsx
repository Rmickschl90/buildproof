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
                <header style={panelStyle}>
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

                    <p style={eyebrowStyle}>BuildProof Help</p>

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
                            Entries document project activity. Attachments support those
                            records. Approvals document decisions that need a clear response.
                        </p>

                        <WorkflowRow
                            items={[
                                { label: "Create project", color: "blue" },
                                { label: "Add entries", color: "yellow" },
                                { label: "Attach files", color: "blue" },
                                { label: "Send updates", color: "green" },
                            ]}
                        />
                    </HelpCard>

                    <HelpCard title="2. Draft entries and finalized updates">
                        <p>
                            Draft entries are internal while you are still working. They are
                            visible on your dashboard, but they are not included in
                            client-facing update records until an update is sent.
                        </p>

                        <p>
                            When you send an update, all draft entries in that project are
                            finalized together. BuildProof treats the current draft timeline as
                            a complete working record instead of requiring individual entry
                            selection.
                        </p>

                        <p>
                            This helps prevent fragmented or incomplete project records,
                            reduces accidental partial sends, and keeps the update process
                            fast and simple in the field with fewer clicks.
                        </p>

                        <WorkflowRow
                            items={[
                                { label: "Draft entries", color: "yellow" },
                                { label: "Finalized on send", color: "green" },
                                { label: "Sent snapshot", color: "blue" },
                            ]}
                        />
                    </HelpCard>
                </section>

                <section style={panelStyle}>
                    <h2
                        style={{
                            margin: "0 0 10px",
                            fontSize: 22,
                            lineHeight: 1.2,
                            fontWeight: 950,
                            letterSpacing: "-0.03em",
                        }}
                    >
                        3. Live timeline vs. sent snapshot
                    </h2>

                    <p
                        style={{
                            margin: "0 0 16px",
                            color: "#475569",
                            fontSize: 15,
                            lineHeight: 1.7,
                        }}
                    >
                        The Share Link on the Send page provides a live project timeline
                        that continues updating as work progresses. Sending an update
                        creates a separate frozen snapshot of the project at that moment to
                        preserve a historical communication record tied to that specific
                        point in time.
                    </p>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                            gap: 16,
                        }}
                    >
                        <ComparisonCard
                            dotColor="#16a34a"
                            title="Live Project Timeline"
                            items={[
                                "Shared using the Share Link on the Send page",
                                "Shows the current evolving project state",
                                "Updates as the project progresses",
                                "New finalized entries appear over time",
                                "Approvals update as statuses change",
                                "Used for ongoing project visibility",
                            ]}
                        />

                        <ComparisonCard
                            dotColor="#2563eb"
                            title="Sent Update Snapshot"
                            items={[
                                "Created automatically when an update is sent",
                                "Frozen at the moment of sending",
                                "Includes finalized records at that time",
                                "Preserves what was communicated at send time",
                                "Creates a historical communication checkpoint",
                            ]}
                        />
                    </div>
                </section>

                <section style={gridStyle}>
                    <HelpCard title="4. Approvals">
                        <p>
                            Approvals are separate from update finalization. They are used for
                            decisions, changes, costs, schedule changes, selections, or
                            anything that needs a clear yes-or-no response.
                        </p>

                        <p>
                            Draft approvals stay internal until they are sent. Once sent, they
                            become client-facing and move through pending, approved, declined,
                            or expired states.
                        </p>

                        <p>
                            Approval history helps preserve when decisions were sent, viewed,
                            and responded to.
                        </p>

                        <WorkflowRow
                            items={[
                                { label: "Draft approval", color: "yellow" },
                                { label: "Pending", color: "blue" },
                                { label: "Approved / Declined", color: "green" },
                            ]}
                        />
                    </HelpCard>

                    <HelpCard title="5. Working offline">
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
                                { label: "Offline", color: "yellow" },
                                { label: "Queued", color: "blue" },
                                { label: "Synced", color: "green" },
                            ]}
                        />
                    </HelpCard>

                    <HelpCard title="6. Private project notes">
                        <p>
                            Project notes are internal-only and are never included in
                            client-facing updates, approvals, PDFs, or share links.
                        </p>

                        <p>
                            Notes can be used for reminders, material tracking, internal
                            planning, punch items, or anything you want attached to the
                            project without sharing externally.
                        </p>

                        <p>
                            Project notes remain available offline and sync automatically when
                            service returns.
                        </p>
                    </HelpCard>

                    <HelpCard title="7. Project records and documentation">
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

                    <HelpCard title="8. Archiving and restoring records">
                        <p>
                            Projects, entries, and approvals can all be archived to help keep
                            active timelines and dashboards organized without permanently
                            removing historical records.
                        </p>

                        <p>
                            Archived items preserve their attachments, timestamps, approval
                            states, and documentation history while remaining out of the active
                            dashboard or project timeline.
                        </p>

                        <p>
                            Archived projects, entries, and approvals can be restored later if
                            they need to return to the active dashboard or project timeline.
                        </p>
                    </HelpCard>

                    <HelpCard title="9. One-click dispute package">
                        <p>
                            If a disagreement ever comes up, BuildProof can generate a structured
                            dispute package in one click from the project menu.
                        </p>

                        <p>
                            The dispute package is designed to organize the project record into a clear,
                            reviewable export instead of forcing you to gather screenshots, emails,
                            photos, and notes manually.
                        </p>

                        <div
                            style={{
                                display: "grid",
                                gap: 10,
                                marginTop: 4,
                            }}
                        >
                            <RecordItem
                                title="Project timeline"
                                text="Finalized entries are organized in timeline order so the work history is easy to follow."
                            />

                            <RecordItem
                                title="Photos and attachments"
                                text="Supporting files are included with the records they belong to, helping connect documentation to the work described."
                            />

                            <RecordItem
                                title="Approvals and responses"
                                text="Approval records show what was requested, who it was sent to, and how the client responded."
                            />

                            <RecordItem
                                title="Timestamps"
                                text="Project activity keeps its original event timing so records stay consistent when reviewed later."
                            />

                            <RecordItem
                                title="Delivery and view activity"
                                text="Sent update records can preserve when project links were delivered and when shared updates were opened, helping maintain a clearer communication history over the life of the project."
                            />

                            <RecordItem
                                title="Integrity verification"
                                text="Integrity hash information helps support confidence that exported records match the preserved project data."
                            />
                        </div>

                        <p>
                            The goal is not to create conflict. The goal is to keep the project record
                            organized, professional, and ready if documentation is ever needed.
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
        <article style={cardStyle}>
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

function ComparisonCard({
    dotColor,
    title,
    items,
}: {
    dotColor: string;
    title: string;
    items: string[];
}) {
    return (
        <article
            style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: 20,
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
                        background: dotColor,
                    }}
                />

                <h3
                    style={{
                        margin: 0,
                        fontSize: 21,
                        fontWeight: 950,
                        letterSpacing: "-0.03em",
                    }}
                >
                    {title}
                </h3>
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
                {items.map((item) => (
                    <li key={item}>{item}</li>
                ))}
            </ul>
        </article>
    );
}

function WorkflowRow({
    items,
}: {
    items: { label: string; color: "yellow" | "green" | "blue" }[];
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
                    key={item.label}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                    }}
                >
                    <div style={getPillStyle(item.color)}>{item.label}</div>

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

            <div style={{ marginTop: 4 }}>{text}</div>
        </div>
    );
}

function getPillStyle(color: "yellow" | "green" | "blue"): React.CSSProperties {
    const styles = {
        yellow: {
            background: "#fffbeb",
            color: "#b45309",
            border: "1px solid #fde68a",
        },
        green: {
            background: "#f0fdf4",
            color: "#15803d",
            border: "1px solid #bbf7d0",
        },
        blue: {
            background: "#eff6ff",
            color: "#1d4ed8",
            border: "1px solid #bfdbfe",
        },
    };

    return {
        ...styles[color],
        borderRadius: 999,
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 800,
    };
}

const panelStyle: React.CSSProperties = {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
};

const cardStyle: React.CSSProperties = {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
};

const eyebrowStyle: React.CSSProperties = {
    margin: "0 0 8px",
    fontSize: 13,
    fontWeight: 900,
    color: "#2563eb",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
};

const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
};