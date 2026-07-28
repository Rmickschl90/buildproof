import { getApprovalByToken } from "@/lib/approvals/getApprovalByToken";

type Props = {
    params: Promise<{
        token: string;
    }>;
};

function formatApprovalType(value: string) {
    switch (value) {
        case "change_order":
            return "Additional Charge";
        case "scope":
            return "Scope";
        case "material":
            return "Material";
        case "schedule":
            return "Schedule";
        default:
            return "General";
    }
}

function formatDate(value: string | null) {
    if (!value) return null;

    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
}

export default async function ApprovalPage({ params }: Props) {
    const { token } = await params;
    const { approval, error } = await getApprovalByToken(token);

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "#f8fafc",
                padding: "24px 16px",
            }}
        >
            <div
                style={{
                    maxWidth: 720,
                    margin: "0 auto",
                    background: "white",
                    borderRadius: 16,
                    padding: 24,
                    boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
                    border: "1px solid rgba(15,23,42,0.08)",
                }}
            >
                <div
                    style={{
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        color: "#2563eb",
                        marginBottom: 8,
                    }}
                >
                    Leeward Approval Request
                </div>

                <h1
                    style={{
                        fontSize: 28,
                        lineHeight: 1.15,
                        margin: 0,
                        color: "#0f172a",
                    }}
                >
                    Approval Review
                </h1>

                {error || !approval ? (
                    <div
                        style={{
                            marginTop: 18,
                            padding: 14,
                            borderRadius: 12,
                            background: "#fef2f2",
                            border: "1px solid rgba(239,68,68,0.18)",
                            color: "#991b1b",
                        }}
                    >
                        {error || "Approval request unavailable."}
                    </div>
                ) : (
                    <>
                        <div
                            style={{
                                marginTop: 18,
                                display: "grid",
                                gap: 14,
                            }}
                        >
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>
                                    Title
                                </div>
                                <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
                                    {approval.title}
                                </div>
                            </div>

                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>
                                    Type
                                </div>
                                <div style={{ color: "#334155" }}>
                                    {formatApprovalType(approval.approval_type)}
                                </div>
                            </div>

                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>
                                    Description
                                </div>
                                <div style={{ color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                                    {approval.description}
                                </div>
                            </div>

                            {Array.isArray(approval.line_items) && approval.line_items.length > 0 ? (
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>
                                        Line Items
                                    </div>
                                    <div
                                        style={{
                                            border: "1px solid rgba(15,23,42,0.08)",
                                            borderRadius: 10,
                                            padding: 12,
                                            background: "#f8fafc",
                                            display: "grid",
                                            gap: 6,
                                        }}
                                    >
                                        {approval.line_items.map((li: any, idx: number) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: 12,
                                                    color: "#334155",
                                                    fontSize: 14,
                                                }}
                                            >
                                                <span>
                                                    {li.description} ({li.quantity} &times; ${li.unit_cost})
                                                </span>
                                                <span style={{ fontWeight: 700 }}>
                                                    ${Number(li.line_total).toFixed(2)}
                                                </span>
                                            </div>
                                        ))}

                                        <div
                                            style={{
                                                marginTop: 4,
                                                paddingTop: 8,
                                                borderTop: "1px solid rgba(15,23,42,0.08)",
                                                display: "flex",
                                                justifyContent: "space-between",
                                                fontWeight: 800,
                                                color: "#0f172a",
                                            }}
                                        >
                                            <span>Total</span>
                                            <span>
                                                $
                                                {approval.line_items
                                                    .reduce(
                                                        (sum: number, li: any) => sum + (Number(li.line_total) || 0),
                                                        0
                                                    )
                                                    .toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : approval.cost_delta !== null ? (
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>
                                        Cost Impact
                                    </div>
                                    <div style={{ color: "#334155" }}>{approval.cost_delta}</div>
                                </div>
                            ) : null}

                            {approval.schedule_delta ? (
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>
                                        Schedule Impact
                                    </div>
                                    <div style={{ color: "#334155" }}>{approval.schedule_delta}</div>
                                </div>
                            ) : null}

                            {approval.due_at ? (
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#475569", marginBottom: 6 }}>
                                        Due Date
                                    </div>
                                    <div style={{ color: "#334155" }}>{formatDate(approval.due_at)}</div>
                                </div>
                            ) : null}

                            <div
                                style={{
                                    display: "flex",
                                    gap: 10,
                                    flexWrap: "wrap",
                                    marginTop: 8,
                                }}
                            >
                                <form action="/api/approvals/respond" method="POST">
                                    <input type="hidden" name="token" value={token} />
                                    <input type="hidden" name="decision" value="approved" />

                                    <button
                                        type="submit"
                                        style={{
                                            border: "1px solid #16a34a",
                                            background: "#16a34a",
                                            color: "white",
                                            borderRadius: 10,
                                            padding: "12px 16px",
                                            fontWeight: 800,
                                            cursor: "pointer",
                                        }}
                                    >
                                        Approve
                                    </button>
                                </form>

                                <form action="/api/approvals/respond" method="POST">
                                    <input type="hidden" name="token" value={token} />
                                    <input type="hidden" name="decision" value="declined" />

                                    <button
                                        type="submit"
                                        style={{
                                            border: "1px solid #dc2626",
                                            background: "#dc2626",
                                            color: "white",
                                            borderRadius: 10,
                                            padding: "12px 16px",
                                            fontWeight: 800,
                                            cursor: "pointer",
                                        }}
                                    >
                                        Decline
                                    </button>
                                </form>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
