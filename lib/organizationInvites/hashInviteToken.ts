import crypto from "crypto";

export function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
