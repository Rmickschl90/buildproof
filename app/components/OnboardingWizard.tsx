"use client";

import { useEffect } from "react";

type Props = {
  projectCount: number;
  entryCount: number;
  hasSelectedProject: boolean;
  hasClientEmail: boolean;
  hasBaselineEstimate: boolean;
  showAttachmentStep: boolean;
  isCompleted?: boolean;
  dismissedSteps: string[];
  onDismissStep: (stepKey: string) => void;
  onAllStepsResolved: () => void;
  onCreateProject: () => void;
  onOpenFirstProject: () => void;
  onAddFirstEntry: () => void;
  onAddFiles: () => void;
  onSendFirstUpdate: () => void;
  onAddClientInfo: () => void;
  onCreateEstimate: () => void;
};

type Step = {
  key: string;
  satisfied: boolean;
  title: string;
  message: string;
  buttonLabel: string;
  buttonAction: () => void;
};

export default function OnboardingWizard({
  projectCount,
  entryCount,
  hasSelectedProject,
  hasClientEmail,
  hasBaselineEstimate,
  showAttachmentStep,
  isCompleted = false,
  dismissedSteps,
  onDismissStep,
  onAllStepsResolved,
  onCreateProject,
  onOpenFirstProject,
  onAddFirstEntry,
  onAddFiles,
  onSendFirstUpdate,
  onAddClientInfo,
  onCreateEstimate,
}: Props) {
  if (isCompleted) return null;

  const steps: Step[] = [
    {
      key: "create_record",
      satisfied: projectCount > 0,
      title: "Welcome to Leeward",
      message: "Start by creating your first record.",
      buttonLabel: "Create Record",
      buttonAction: onCreateProject,
    },
    {
      key: "open_record",
      satisfied: hasSelectedProject,
      title: "Open your first record",
      message: "Select a record to start building the timeline.",
      buttonLabel: "Open First Record",
      buttonAction: onOpenFirstProject,
    },
    {
      key: "client_info",
      satisfied: hasClientEmail,
      title: "Add client info",
      message:
        "Add a client email now so you can send updates without backtracking later.",
      buttonLabel: "Add Client Info",
      buttonAction: onAddClientInfo,
    },
    {
      key: "estimate",
      satisfied: hasBaselineEstimate,
      title: "Create your original estimate",
      message:
        "Set up your starting estimate on the Estimate tab. You can add additional charges later, and clients can view a live running total.",
      buttonLabel: "Create Estimate",
      buttonAction: onCreateEstimate,
    },
    {
      key: "attachments",
      satisfied: !showAttachmentStep,
      title: "Add photos or files",
      message: "Attach photos, invoices, or documents to complete this entry.",
      buttonLabel: "Add Files",
      buttonAction: onAddFiles,
    },
    {
      key: "first_entry",
      satisfied: entryCount > 0,
      title: "Great! Now add your first entry.",
      message: "Entries keep a timeline of record updates.",
      buttonLabel: "Add First Entry",
      buttonAction: onAddFirstEntry,
    },
    {
      key: "send_update",
      satisfied: false,
      title: "Nice work",
      message: "Next, send your first client update.",
      buttonLabel: "Send First Update",
      buttonAction: onSendFirstUpdate,
    },
  ];

  const activeStep = steps.find(
    (step) => !step.satisfied && !dismissedSteps.includes(step.key)
  );

  // Every step is either genuinely completed or dismissed — nothing left to
  // nudge about. Notify the parent (after render, not during) so it can
  // persist the "done forever" flag; the parent guards against re-firing
  // once isCompleted flips true.
  useEffect(() => {
    if (!activeStep) {
      onAllStepsResolved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!activeStep]);

  if (!activeStep) {
    return null;
  }

  const { title, message, buttonLabel, buttonAction, key } = activeStep;

  return (
    <div
      id="onboarding-wizard"
      style={{
        marginTop: 14,
        marginBottom: 14,
        padding: 18,
        borderRadius: 18,
        border: "1px solid rgba(var(--accent-rgb),0.18)",
        background:
          "linear-gradient(135deg, rgba(var(--accent-rgb),0.12) 0%, rgba(var(--accent-rgb),0.05) 100%)",
        boxShadow: "var(--shadowSoft)",
        position: "relative",
      }}
    >
      <button
        type="button"
        aria-label="Dismiss this step"
        onClick={() => onDismissStep(key)}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 28,
          height: 28,
          borderRadius: 999,
          border: "1px solid rgba(var(--text-rgb),0.15)",
          background: "rgba(var(--text-rgb),0.06)",
          color: "rgba(var(--text-rgb),0.6)",
          fontSize: 15,
          fontWeight: 700,
          lineHeight: 1,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ×
      </button>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "var(--accentText)",
              marginBottom: 6,
              paddingRight: 32,
            }}
          >
            Getting Started
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: 28,
              lineHeight: 1.1,
              fontWeight: 900,
              color: "var(--text)",
              paddingRight: 32,
            }}
          >
            {title}
          </h2>

          <p
            style={{
              margin: "10px 0 0 0",
              fontSize: 16,
              lineHeight: 1.5,
              color: "rgba(var(--text-rgb),0.72)",
              maxWidth: 700,
            }}
          >
            {message}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btnPrimary" onClick={buttonAction}>
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
