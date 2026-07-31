export const dynamic = "force-dynamic";

export default function HelpPage() {
    return (
        <main
            style={{
                minHeight: "100vh",
                background: "var(--bg)",
                color: "var(--text)",
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
                            color: "var(--accentText)",
                            fontWeight: 800,
                            textDecoration: "none",
                        }}
                    >
                        ← Back to dashboard
                    </a>

                    <p style={eyebrowStyle}>Leeward Help</p>

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
                            color: "rgba(var(--text-rgb), 0.72)",
                            fontSize: 16,
                            lineHeight: 1.6,
                            maxWidth: 760,
                        }}
                    >
                        Leeward helps you keep a clean record timeline, send clear
                        updates, track approvals and estimates, log payments, and
                        preserve a reliable record if questions come up later.
                    </p>
                </header>

                <section style={gridStyle}>
                    <HelpCard title="1. How Leeward works">
                        <p>
                            Each record has a timeline. Add entries as work happens,
                            attach photos or files, and keep client information in one
                            place.
                        </p>

                        <p>
                            A record is organized into three tabs: <strong>Timeline</strong>{" "}
                            (entries, photos, and files), <strong>Estimate</strong>{" "}
                            (your original estimate, additional charges, and payments),
                            and <strong>Documents</strong> (internal reference files like
                            leases, insurance certificates, or permits).
                        </p>

                        <p>
                            Entries document record activity. Attachments support those
                            records. Approvals document decisions that need a clear
                            response.
                        </p>

                        <WorkflowRow
                            items={[
                                { label: "Create record", color: "blue" },
                                { label: "Add entries", color: "yellow" },
                                { label: "Attach files", color: "blue" },
                                { label: "Send updates", color: "green" },
                            ]}
                        />
                    </HelpCard>

                    <HelpCard title="2. Draft entries and finalized updates">
                        <p>
                            Draft entries are internal while you are still working. They
                            are visible on your dashboard, but they are not included in
                            client-facing update records until an update is sent.
                        </p>

                        <p>
                            When you send an update, all draft entries in that record are
                            finalized together. Leeward treats the current draft timeline
                            as a complete working record instead of requiring individual
                            entry selection.
                        </p>

                        <p>
                            This helps prevent fragmented or incomplete records, reduces
                            accidental partial sends, and keeps the update process fast
                            and simple in the field with fewer clicks.
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
                            color: "rgba(var(--text-rgb), 0.72)",
                            fontSize: 15,
                            lineHeight: 1.7,
                        }}
                    >
                        The Share Link on the Send page provides a live record timeline
                        that continues updating as work progresses. Sending an update
                        creates a separate frozen snapshot of the record at that moment
                        to preserve a historical communication record tied to that
                        specific point in time.
                    </p>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                            gap: 16,
                        }}
                    >
                        <ComparisonCard
                            dotColor="rgb(var(--success-rgb))"
                            title="Live Record Timeline"
                            items={[
                                "Shared using the Share Link on the Send page",
                                "Shows the current evolving record state",
                                "Updates as work progresses",
                                "New finalized entries appear over time",
                                "Approvals update as statuses change",
                                "Used for ongoing record visibility",
                            ]}
                        />

                        <ComparisonCard
                            dotColor="rgb(var(--accent-rgb))"
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
                            Approvals are separate from update finalization. They are
                            used for decisions, changes, costs, schedule changes,
                            selections, or anything that needs a clear yes-or-no
                            response.
                        </p>

                        <p>
                            Draft approvals stay internal until they are sent. Once
                            sent, they become client-facing and move through pending,
                            approved, declined, or expired states.
                        </p>

                        <p>
                            Approval history helps preserve when decisions were sent,
                            viewed, and responded to. Approvals also power the Estimate
                            tab — see the Estimates &amp; Additional Charges section
                            below for cost-specific detail.
                        </p>

                        <WorkflowRow
                            items={[
                                { label: "Draft approval", color: "yellow" },
                                { label: "Pending", color: "blue" },
                                { label: "Approved / Declined", color: "green" },
                            ]}
                        />
                    </HelpCard>

                    <HelpCard title="5. Estimates & Additional Charges">
                        <p>
                            The Estimate tab holds your <strong>Original Estimate</strong>{" "}
                            (the first approval on a record, marked as the baseline) and
                            any number of <strong>Additional Charges</strong> — change
                            orders or extra work sent as separate approvals.
                        </p>

                        <p>
                            The Current Total shown at the top of the Estimate tab is the
                            Original Estimate plus any Additional Charges that have been
                            approved. Pending or declined charges are never included in
                            the total.
                        </p>

                        <p>
                            The colored status dot on a record in your Records list
                            reflects the Original Estimate only — pending, approved, or
                            declined — not the status of any Additional Charge.
                        </p>

                        <p>
                            <strong>Share Invoice</strong> gives the client a live,
                            read-only link showing the running total, itemized line
                            items, and Paid / Balance Due — separate from the main
                            Share Link, which shows the full timeline, notes, and
                            photos.
                        </p>
                    </HelpCard>

                    <HelpCard title="6. Payments">
                        <p>
                            Log payments received against a record — a check, a Venmo
                            transfer, cash, anything. This tracks payment, it does not
                            collect it: no card is charged and no money moves through
                            Leeward.
                        </p>

                        <p>
                            When logging a payment, choose either a dollar amount or a
                            percentage of the current Balance Due. Paid and Balance Due
                            appear next to the Current Total — the Total itself never
                            changes based on payments.
                        </p>

                        <p>
                            To correct a logged payment, delete it and log it again;
                            payments are not edited in place. Paid / Balance Due are
                            visible to clients as summary figures on the Invoice link.
                            The full itemized payment log (dates, notes, amounts) only
                            appears in the Export Dispute Package PDF, never in the
                            regular Download PDF or a sent update.
                        </p>
                    </HelpCard>

                    <HelpCard title="7. Documents tab">
                        <p>
                            The Documents tab is a file vault for material that
                            describes the record generally rather than a specific
                            moment — leases, insurance certificates, permits — and
                            isn&apos;t tied to a Timeline entry or approval.
                        </p>

                        <p>
                            Documents are internal-only and are never shown to the
                            client on any share link.
                        </p>

                        <p>
                            Each document has an &quot;Include in dispute packet&quot;
                            toggle, off by default. Turning it on means that document
                            will ride along the next time you export a dispute package,
                            without adding an extra step at export time.
                        </p>

                        <p>
                            Uploading a document requires an active connection — unlike
                            entries, attachments, and approvals, Documents uploads are
                            not queued for offline sync.
                        </p>
                    </HelpCard>
                </section>

                <section style={gridStyle}>
                    <HelpCard title="8. Working offline">
                        <p>
                            Leeward is designed for real jobsites. If service drops, you
                            can keep adding records, entries, photos, approvals,
                            payments, and notes.
                        </p>

                        <p>
                            Offline work is saved on your device and syncs
                            automatically when your connection returns. The Documents
                            tab is the one exception — see above.
                        </p>

                        <WorkflowRow
                            items={[
                                { label: "Offline", color: "yellow" },
                                { label: "Queued", color: "blue" },
                                { label: "Synced", color: "green" },
                            ]}
                        />
                    </HelpCard>

                    <HelpCard title="9. Private record notes">
                        <p>
                            Record notes are internal-only and are never included in
                            client-facing updates, approvals, PDFs, or share links.
                        </p>

                        <p>
                            Notes can be used for reminders, material tracking, internal
                            planning, punch items, or anything you want attached to the
                            record without sharing externally.
                        </p>

                        <p>
                            Private notes remain available offline and sync
                            automatically when service returns.
                        </p>
                    </HelpCard>

                    <HelpCard title="10. Record documentation and history">
                        <p>
                            Leeward preserves structured records designed to remain
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
                                text="Timeline records preserve original event times to help maintain a reliable record history."
                            />

                            <RecordItem
                                title="Delivery & View History"
                                text="Sent updates preserve delivery records and view activity tied to that communication."
                            />

                            <RecordItem
                                title="Approval History"
                                text="Approval workflows preserve sent, viewed, approved, declined, and expired states."
                            />

                            <RecordItem
                                title="Integrity Hashes"
                                text="Exports include integrity verification data intended to help preserve confidence in your records over time."
                            />

                            <RecordItem
                                title="PDF & Dispute Exports"
                                text="Structured exports are designed to provide a clean historical record when documentation needs to be reviewed later."
                            />
                        </div>
                    </HelpCard>

                    <HelpCard title="11. Archiving and restoring records">
                        <p>
                            Records, entries, and approvals can all be archived to help
                            keep active timelines and dashboards organized without
                            permanently removing historical records.
                        </p>

                        <p>
                            Archived items preserve their attachments, timestamps,
                            approval states, and documentation history while remaining
                            out of the active dashboard or record timeline.
                        </p>

                        <p>
                            Archived records, entries, and approvals can be restored
                            later if they need to return to the active dashboard or
                            record timeline.
                        </p>
                    </HelpCard>
                </section>

                <section style={gridStyle}>
                    <HelpCard title="12. One-click dispute package">
                        <p>
                            If a disagreement ever comes up, Leeward can generate a
                            structured dispute package in one click from the record
                            menu.
                        </p>

                        <p>
                            The dispute package is designed to organize the record into
                            a clear, reviewable export instead of forcing you to gather
                            screenshots, emails, photos, and notes manually.
                        </p>

                        <div
                            style={{
                                display: "grid",
                                gap: 10,
                                marginTop: 4,
                            }}
                        >
                            <RecordItem
                                title="Record timeline"
                                text="Finalized entries are organized in timeline order so the work history is easy to follow."
                            />

                            <RecordItem
                                title="Photos and attachments"
                                text="Supporting files are included with the records they belong to, helping connect documentation to the work described."
                            />

                            <RecordItem
                                title="Approvals and responses"
                                text="Approval records show what was requested, who it was sent to, and how the client responded, including the Original Estimate and any Additional Charges."
                            />

                            <RecordItem
                                title="Payment summary and log"
                                text="Contract total, amount paid, and balance due, plus a full itemized log of every logged payment — dates, notes, and amounts."
                            />

                            <RecordItem
                                title="Reference documents"
                                text="Any Documents-tab file you've explicitly opted in via its 'Include in dispute packet' toggle."
                            />

                            <RecordItem
                                title="Timestamps"
                                text="Record activity keeps its original event timing so records stay consistent when reviewed later."
                            />

                            <RecordItem
                                title="Delivery and view activity"
                                text="Sent update records can preserve when links were delivered and when shared updates were opened, helping maintain a clearer communication history over the life of the record."
                            />

                            <RecordItem
                                title="Integrity verification"
                                text="Integrity hash information helps support confidence that exported records match the preserved record data."
                            />
                        </div>

                        <p>
                            The goal is not to create conflict. The goal is to keep the
                            record organized, professional, and ready if documentation
                            is ever needed.
                        </p>
                    </HelpCard>

                    <HelpCard title="13. Team accounts">
                        <p>
                            Individual accounts can upgrade to a Team plan so multiple
                            people can share access to the same records — useful once
                            you have office staff, crew leads, or partners who all need
                            visibility.
                        </p>

                        <p>
                            There are two roles: <strong>Owner</strong> (manages
                            billing, invites and removes members, full record access)
                            and <strong>Member</strong> (full record access). There are
                            no admin, read-only, or per-record permission levels.
                        </p>

                        <p>
                            Every team member can see and work on every one of the
                            team&apos;s records — there is no per-record visibility
                            restriction. The team owner invites teammates by email from
                            the Account menu; an invited teammate creates an account or
                            signs in to accept. Removing a member revokes their access
                            immediately.
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
                    color: "rgba(var(--text-rgb), 0.72)",
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
                background: "var(--surfaceAlt2)",
                border: "1px solid var(--border)",
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
                    color: "rgba(var(--text-rgb), 0.72)",
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
                                color: "var(--muted)",
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
                background: "var(--surfaceAlt2)",
                border: "1px solid var(--border)",
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
            background: "rgba(var(--warning-rgb), 0.12)",
            color: "var(--warningTextAlt)",
            border: "1px solid rgba(var(--warning-rgb), 0.35)",
        },
        green: {
            background: "rgba(var(--success-rgb), 0.12)",
            color: "var(--successText)",
            border: "1px solid rgba(var(--success-rgb), 0.35)",
        },
        blue: {
            background: "rgba(var(--accent-rgb), 0.12)",
            color: "var(--accentText)",
            border: "1px solid rgba(var(--accent-rgb), 0.35)",
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
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 22,
    boxShadow: "var(--shadow)",
};

const cardStyle: React.CSSProperties = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 20,
    boxShadow: "var(--shadow)",
};

const eyebrowStyle: React.CSSProperties = {
    margin: "0 0 8px",
    fontSize: 13,
    fontWeight: 900,
    color: "var(--accentText)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
};

const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
};
