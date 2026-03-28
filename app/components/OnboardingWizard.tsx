"use client";

type Props = {
  projectCount: number;
  entryCount: number;
  hasSelectedProject: boolean;
  hasClientEmail: boolean;
  showAttachmentStep: boolean;
  isCompleted?: boolean;
  onCreateProject: () => void;
  onOpenFirstProject: () => void;
  onAddFirstEntry: () => void;
  onAddFiles: () => void;
  onSendFirstUpdate: () => void;
  onAddClientInfo: () => void;
};

export default function OnboardingWizard({
  projectCount,
  entryCount,
  hasSelectedProject,
  hasClientEmail,
  showAttachmentStep,
  isCompleted = false,
  onCreateProject,
  onOpenFirstProject,
  onAddFirstEntry,
  onAddFiles,
  onSendFirstUpdate,
  onAddClientInfo,
}: Props) {
  if (isCompleted) return null;

  let eyebrow = "Getting Started";
  let title = "";
  let message = "";
  let buttonLabel = "";
  let buttonAction = onCreateProject;

  if (projectCount === 0) {
    title = "Welcome to BuildProof";
    message = "Start by creating your first project.";
    buttonLabel = "Create Project";
    buttonAction = onCreateProject;
  } else if (!hasSelectedProject) {
    title = "Open your first project";
    message = "Select a project to start building the timeline.";
    buttonLabel = "Open First Project";
    buttonAction = onOpenFirstProject;
  } else if (!hasClientEmail) {
    title = "Add client info";
    message = "Add a client email now so you can send updates without backtracking later.";
    buttonLabel = "Add Client Info";
    buttonAction = onAddClientInfo;
  } else if (showAttachmentStep) {
    title = "Add photos or files";
    message = "Attach photos, invoices, or documents to complete this entry.";
    buttonLabel = "Add Files";
    buttonAction = onAddFiles;
  } else if (entryCount === 0) {
    title = "Great! Now add your first entry.";
    message = "Entries keep a timeline of project updates.";
    buttonLabel = "Add First Entry";
    buttonAction = onAddFirstEntry;
  } else {
    title = "Nice work";
    message = "Next, send your first client update.";
    buttonLabel = "Send First Update";
    buttonAction = onSendFirstUpdate;
  }

  return (
    <div
      id="onboarding-wizard"
      style={{
        marginTop: 14,
        marginBottom: 14,
        padding: 18,
        borderRadius: 18,
        border: "1px solid rgba(37,99,235,0.18)",
        background:
          "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(224,242,254,1) 100%)",
        boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
      }}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "#1d4ed8",
              marginBottom: 6,
            }}
          >
            {eyebrow}
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: 28,
              lineHeight: 1.1,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            {title}
          </h2>

          <p
            style={{
              margin: "10px 0 0 0",
              fontSize: 16,
              lineHeight: 1.5,
              color: "#334155",
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