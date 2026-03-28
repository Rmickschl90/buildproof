export type ApprovalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "declined"
  | "expired";

export function canEditApproval(status: ApprovalStatus) {
  return status === "draft";
}

export function canSendApproval(status: ApprovalStatus) {
  return status === "draft";
}

export function canResendApproval(status: ApprovalStatus) {
  return status === "pending";
}

export function canExpireApproval(status: ApprovalStatus) {
  return status === "pending";
}

export function isFinalApprovalStatus(status: ApprovalStatus) {
  return (
    status === "approved" ||
    status === "declined" ||
    status === "expired"
  );
}

export function canRespondToApproval(status: ApprovalStatus) {
  return status === "pending";
}