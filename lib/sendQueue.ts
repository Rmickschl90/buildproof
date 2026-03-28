export type SendJobStatus =
  | "pending"
  | "processing"
  | "retrying"
  | "sent"
  | "failed";

export function getRetryDelayMs(nextAttemptNumber: number) {
  switch (nextAttemptNumber) {
    case 1:
      return 0;
    case 2:
      return 30_000;
    case 3:
      return 2 * 60_000;
    case 4:
      return 10 * 60_000;
    default:
      return 30 * 60_000;
  }
}

export function computeNextRetryAt(nextAttemptNumber: number) {
  return new Date(Date.now() + getRetryDelayMs(nextAttemptNumber)).toISOString();
}