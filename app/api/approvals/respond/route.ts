import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getApprovalByToken } from "@/lib/approvals/getApprovalByToken";
import { canRespondToApproval } from "@/lib/approvals/approvalStatusGuards";
import { hashApprovalToken } from "@/lib/approvals/hashApprovalToken";

const ALLOWED_DECISIONS = ["approved", "declined"] as const;

function getAppOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ||
    "https://app.buildproof.app"
  );
}

function buildResultUrl(pathAndQuery: string) {
  return new URL(pathAndQuery, getAppOrigin());
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const token = String(formData.get("token") ?? "").trim();
    const decision = String(formData.get("decision") ?? "").trim();
    const comment = formData.get("comment")
      ? String(formData.get("comment")).trim()
      : null;
    const responderName = formData.get("responderName")
      ? String(formData.get("responderName")).trim()
      : null;

    if (!token) {
      return NextResponse.redirect(
        buildResultUrl("/approval/result?status=error"),
        303
      );
    }

    if (
      !ALLOWED_DECISIONS.includes(
        decision as (typeof ALLOWED_DECISIONS)[number]
      )
    ) {
      return NextResponse.redirect(
        buildResultUrl("/approval/result?status=error"),
        303
      );
    }

    const { approval, error } = await getApprovalByToken(token);

    if (error || !approval) {
      return NextResponse.redirect(
        buildResultUrl(
          `/approval/result?status=error&message=${encodeURIComponent(
            error || "Approval unavailable."
          )}`
        ),
        303
      );
    }

    if (!canRespondToApproval(approval.status)) {
      return NextResponse.redirect(
        buildResultUrl(
          `/approval/result?status=error&message=${encodeURIComponent(
            "This approval request can no longer be answered."
          )}`
        ),
        303
      );
    }

    const tokenHash = hashApprovalToken(token);

    const { data: tokenRow, error: tokenError } = await supabaseServer
      .from("approval_tokens")
      .select("approval_request_id, used_at")
      .eq("token_hash", tokenHash)
      .single();

    if (tokenError || !tokenRow) {
      return NextResponse.redirect(
        buildResultUrl(
          `/approval/result?status=error&message=${encodeURIComponent(
            "Invalid approval link."
          )}`
        ),
        303
      );
    }

    if (tokenRow.used_at) {
      return NextResponse.redirect(
        buildResultUrl(
          `/approval/result?status=error&message=${encodeURIComponent(
            "This approval link has already been used."
          )}`
        ),
        303
      );
    }

    const respondedAt = new Date().toISOString();

    const { error: responseInsertError } = await supabaseServer
      .from("approval_responses")
      .insert({
        approval_request_id: approval.id,
        decision,
        comment,
        responder_name: responderName,
        responder_email_snapshot: approval.recipient_email,
        ip_address: req.headers.get("x-forwarded-for") || null,
        user_agent: req.headers.get("user-agent") || null,
      });

    if (responseInsertError) {
      console.error(
        "[approvals/respond] response insert error",
        responseInsertError
      );
      return NextResponse.redirect(
        buildResultUrl(
          `/approval/result?status=error&message=${encodeURIComponent(
            "Failed to save approval response."
          )}`
        ),
        303
      );
    }

    const { error: approvalUpdateError } = await supabaseServer
      .from("approval_requests")
      .update({
        status: decision,
        responded_at: respondedAt,
        updated_at: respondedAt,
      })
      .eq("id", approval.id);

    if (approvalUpdateError) {
      console.error(
        "[approvals/respond] approval update error",
        approvalUpdateError
      );
      return NextResponse.redirect(
        buildResultUrl(
          `/approval/result?status=error&message=${encodeURIComponent(
            "Failed to update approval status."
          )}`
        ),
        303
      );
    }

    const { error: tokenUpdateError } = await supabaseServer
      .from("approval_tokens")
      .update({
        used_at: respondedAt,
      })
      .eq("token_hash", tokenHash);

    if (tokenUpdateError) {
      console.error("[approvals/respond] token update error", tokenUpdateError);
      return NextResponse.redirect(
        buildResultUrl(
          `/approval/result?status=error&message=${encodeURIComponent(
            "Failed to finalize approval link."
          )}`
        ),
        303
      );
    }

    return NextResponse.redirect(
      buildResultUrl(
        `/approval/result?status=success&decision=${encodeURIComponent(decision)}`
      ),
      303
    );
  } catch (error: any) {
    console.error("[approvals/respond] unexpected error", error);
    return NextResponse.redirect(
      buildResultUrl(
        `/approval/result?status=error&message=${encodeURIComponent(
          error?.message || "Unexpected server error."
        )}`
      ),
      303
    );
  }
}