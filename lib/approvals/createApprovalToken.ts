import crypto from "crypto";

export function createApprovalToken() {
  return crypto.randomBytes(32).toString("hex");
}