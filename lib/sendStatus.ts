export type SendUiStatus =
  | "idle"
  | "saving_intent"
  | "queued_offline"
  | "creating_job"
  | "sending_job"
  | "finalizing_entries"
  | "sent"
  | "failed";

export function getSendStatusLabel(status: SendUiStatus): string {
  switch (status) {
    case "saving_intent":
      return "Saving update...";
    case "queued_offline":
      return "Waiting for connection...";
    case "creating_job":
      return "Preparing send...";
    case "sending_job":
      return "Sending update...";
    case "finalizing_entries":
      return "Finalizing entries...";
    case "sent":
      return "Update sent";
    case "failed":
      return "Send failed";
    case "idle":
    default:
      return "";
  }
}