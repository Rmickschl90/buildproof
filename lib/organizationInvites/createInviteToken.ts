import crypto from "crypto";

export function createInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}
