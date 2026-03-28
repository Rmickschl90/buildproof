import { supabaseServer } from "@/lib/supabaseServer";
import { hashApprovalToken } from "./hashApprovalToken";

export async function getApprovalByToken(rawToken: string) {
  const token = String(rawToken || "").trim();

  if (!token) {
    return { approval: null, error: "Missing token." };
  }

  const tokenHash = hashApprovalToken(token);

  const { data: tokenRow, error: tokenError } = await supabaseServer
    .from("approval_tokens")
    .select("approval_request_id, token_hash, expires_at, used_at, created_at")
    .eq("token_hash", tokenHash)
    .single();

  if (tokenError || !tokenRow) {
    return { approval: null, error: "Invalid approval link." };
  }

  if (tokenRow.used_at) {
    return { approval: null, error: "This approval link has already been used." };
  }

  if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return { approval: null, error: "This approval link has expired." };
  }

  const { data: approval, error: approvalError } = await supabaseServer
    .from("approval_requests")
    .select("*")
    .eq("id", tokenRow.approval_request_id)
    .single();

  if (approvalError || !approval) {
    return { approval: null, error: "Approval request not found." };
  }

  if (approval.status !== "pending") {
    return { approval: null, error: "This approval request is no longer available." };
  }

  return { approval, error: null };
}