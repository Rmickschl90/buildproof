import { hashApprovalToken } from "./hashApprovalToken";

export function validateApprovalToken(rawToken: string, storedHash: string) {
  if (!rawToken || !storedHash) return false;
  return hashApprovalToken(rawToken) === storedHash;
}