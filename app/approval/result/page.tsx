type Props = {
  searchParams: Promise<{
    status?: string;
    decision?: string;
    message?: string;
  }>;
};

function getDecisionLabel(decision?: string) {
  if (decision === "approved") return "Approved";
  if (decision === "declined") return "Declined";
  return "Completed";
}

export default async function ApprovalResultPage({ searchParams }: Props) {
  const params = await searchParams;
  const status = params.status || "error";
  const decision = params.decision || "";
  const message = params.message || "";

  const isSuccess = status === "success";

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
            color: isSuccess ? "#16a34a" : "#dc2626",
            marginBottom: 8,
          }}
        >
          BuildProof Approval Request
        </div>

        <h1
          style={{
            fontSize: 28,
            lineHeight: 1.15,
            margin: 0,
            color: "#0f172a",
          }}
        >
          {isSuccess ? getDecisionLabel(decision) : "Unable to Process Request"}
        </h1>

        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 12,
            background: isSuccess ? "#f0fdf4" : "#fef2f2",
            border: isSuccess
              ? "1px solid rgba(22,163,74,0.18)"
              : "1px solid rgba(239,68,68,0.18)",
            color: isSuccess ? "#166534" : "#991b1b",
          }}
        >
          {isSuccess ? (
            <div>
              Your response has been recorded successfully.
            </div>
          ) : (
            <div>
              {message || "This approval request could not be completed."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}