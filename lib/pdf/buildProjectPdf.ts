import { PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import { normalizeImageForPdf } from "@/lib/pdfImageNormalizer";

// ---------- Types matching your DB usage ----------
export type ProjectRow = {
  id: string;
  title: string;
  created_at?: string;
  client_name?: string | null;
  client_email?: string | null;
};

export type ProofRow = {
  id: number;
  project_id?: string;
  content: string | null;
  created_at: string;
  locked_at: string | null;
};

export type AttachmentRow = {
  id: string;
  project_id: string;
  proof_id: number;
  filename: string | null;
  mime_type: string | null;
  path: string;
  created_at?: string | null;
};

export type DeliveryRow = {
  id: string;
  project_id: string;
  status: string | null;
  to_address: string | null;
  error: string | null;
  created_at: string | null;
};

export type ProjectContactEventRow = {
  id: string;
  project_id: string;
  user_id: string;
  event_type: string;
  previous_email: string | null;
  new_email: string | null;
  created_at: string | null;
};

export type ShareViewRow = {
  id: string;
  project_id: string;
  share_token: string;
  viewed_at: string | null;
};

export type ApprovalRow = {
  id: string;
  project_id: string;
  title: string | null;
  approval_type: string | null;
  description: string | null;
  cost_delta: number | null;
  schedule_delta: string | null;
  status: string | null;
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
  expired_at: string | null;
  archived_at: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
};

export type ApprovalResponseRow = {
  id: string;
  approval_id?: string | null;
  decision: string | null;
  responded_at?: string | null;
  ip_address: string | null;
  user_agent: string | null;
};

export type ApprovalAttachmentRow = {
  id: string;
  approval_id: string;
  project_id: string;
  filename: string | null;
  mime_type: string | null;
  path: string;
  created_at: string;
};

export type ApprovalWithResponseRow = ApprovalRow & {
  approval_responses?: ApprovalResponseRow[] | null;
  attachments?: ApprovalAttachmentRow[] | null;
};

// ---------- Args expected by your route ----------
export type BuildProjectPdfArgs = {
  project: ProjectRow;
  proofs: ProofRow[];
  attachments: AttachmentRow[];
  approvals?: ApprovalWithResponseRow[];
  deliveries?: DeliveryRow[];
  contactEvents?: ProjectContactEventRow[];
  shareViews?: ShareViewRow[];
  timelineHash?: string | null;
  supabase: any;
  reportMode?: "standard" | "dispute";
};

const PAGE_SIZE: [number, number] = [612, 792]; // Letter
const PAGE_WIDTH = PAGE_SIZE[0];
const PAGE_HEIGHT = PAGE_SIZE[1];
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

const COLORS = {
  ink: rgb(0.08, 0.1, 0.14),
  text: rgb(0.15, 0.17, 0.22),
  muted: rgb(0.42, 0.46, 0.52),
  faint: rgb(0.67, 0.71, 0.77),
  line: rgb(0.87, 0.89, 0.92),
  soft: rgb(0.965, 0.972, 0.985),
  softBlue: rgb(0.93, 0.95, 0.985),
  white: rgb(1, 1, 1),
  navy: rgb(0.12, 0.2, 0.36),
  navy2: rgb(0.17, 0.27, 0.47),
  navy3: rgb(0.24, 0.37, 0.58),
  successBg: rgb(0.9, 0.96, 0.92),
  successText: rgb(0.14, 0.4, 0.21),
  warningBg: rgb(0.99, 0.95, 0.86),
  warningText: rgb(0.68, 0.45, 0.08),
  dangerBg: rgb(0.98, 0.91, 0.91),
  dangerText: rgb(0.65, 0.16, 0.16),
  neutralBg: rgb(0.94, 0.95, 0.97),
  neutralText: rgb(0.38, 0.41, 0.46),
  draftBg: rgb(0.95, 0.95, 0.96),
  draftText: rgb(0.37, 0.39, 0.43),
};

export async function buildProjectPdf(
  args: BuildProjectPdfArgs
): Promise<{ pdfBuffer: Uint8Array; filename: string }> {
  const {
    project,
    proofs,
    attachments,
    approvals = [],
    deliveries = [],
    contactEvents = [],
    shareViews = [],
    timelineHash = null,
    supabase,
    reportMode = "standard",
  } = args;

  console.log("[buildProjectPdf] projectId =", project.id);
  console.log("[buildProjectPdf] proofs =", proofs?.length ?? 0);
  console.log("[buildProjectPdf] approvals =", approvals?.length ?? 0);
  console.log(
    "[buildProjectPdf] approval statuses =",
    (approvals ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      sent_at: a.sent_at,
      created_at: a.created_at,
      archived_at: a.archived_at,
    }))
  );

  const sortedProofs = [...(proofs ?? [])].sort((a, b) => {
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();

    if (reportMode === "dispute") {
      return aTime - bTime; // oldest first
    }

    return bTime - aTime; // newest first for standard project updates
  });

  const sortedApprovals = [...(approvals ?? [])].sort((a, b) => {
    const aTime = new Date(a.sent_at || a.created_at).getTime();
    const bTime = new Date(b.sent_at || b.created_at).getTime();

    if (reportMode === "dispute") {
      return aTime - bTime; // oldest first
    }

    return bTime - aTime; // newest first for standard project updates
  });

  const timelineItems = [
    ...sortedProofs.map((proof) => ({
      kind: "proof" as const,
      sortAt: proof.created_at,
      proof,
    })),
    ...sortedApprovals.map((approval) => ({
      kind: "approval" as const,
      sortAt: approval.sent_at || approval.created_at,
      approval,
    })),
  ].sort((a, b) => {
    const aTime = new Date(a.sortAt).getTime();
    const bTime = new Date(b.sortAt).getTime();

    if (reportMode === "dispute") {
      return aTime - bTime;
    }

    return bTime - aTime;
  });

  const byProofId = new Map<number, AttachmentRow[]>();
  for (const att of attachments ?? []) {
    if (!byProofId.has(att.proof_id)) byProofId.set(att.proof_id, []);
    byProofId.get(att.proof_id)!.push(att);
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  addCoverPage({
    pdf,
    font,
    fontBold,
    projectTitle: sanitizePdfText(project.title || "Project"),
    clientName: sanitizePdfText(project.client_name || "Not set"),
    clientEmail: sanitizePdfText(project.client_email || "Not set"),
    dateRangeText: sanitizePdfText(getDateRange(sortedProofs, sortedApprovals)),
    counts: getCounts(sortedProofs, attachments, sortedApprovals),
    generatedAtIso: new Date().toISOString(),
    reportMode,
    timelineHash,
  });

  let pageNumber = 2;
  let page = addTimelinePage(
    pdf,
    font,
    fontBold,
    project.title || "Project",
    pageNumber,
    { reportMode, timelineHash }
  );
  let y = PAGE_HEIGHT - MARGIN - 64;

  page.drawText("Project Timeline", {
    x: MARGIN,
    y,
    size: 18,
    font: fontBold,
    color: COLORS.navy3,
  });

  y -= 26;

  page.drawText("Chronological record of entries, approvals, photos, and attached files.", {
    x: MARGIN,
    y,
    size: 10.5,
    font,
    color: COLORS.muted,
  });

  y -= 28;

  for (let i = 0; i < timelineItems.length; i++) {
    const item = timelineItems[i];
    if (item.kind === "approval") {

      const approval = item.approval;

      const title = sanitizePdfText(approval.title || "Approval Request");
      const type = sanitizePdfText(approval.approval_type || "Approval");
      const description = sanitizePdfText(approval.description || "");
      const approvalAttachments = approval.attachments || [];
      const imageApprovalAttachments = approvalAttachments.filter((attachment) =>
        String(attachment.mime_type || "").startsWith("image/")
      );
      const costImpact = approval.cost_delta != null ? `$${approval.cost_delta}` : "None";
      const scheduleImpact = sanitizePdfText(approval.schedule_delta || "None");

      const sentAt = sanitizePdfText(formatDateTime(approval.sent_at || approval.created_at));
      const respondedAt = approval.responded_at
        ? sanitizePdfText(formatDateTime(approval.responded_at))
        : null;

      const statusLabel = approval.archived_at
        ? `${getApprovalStatusLabel(approval.status)} • Archived`
        : getApprovalStatusLabel(approval.status);
      const badgeStyle = getApprovalBadgeStyle(approval.status);

      const latestResponse =
        approval.approval_responses && approval.approval_responses.length > 0
          ? [...approval.approval_responses].sort((a, b) => {
            const aTime = new Date(a.responded_at || "").getTime();
            const bTime = new Date(b.responded_at || "").getTime();
            return bTime - aTime;
          })[0]
          : null;

      const disputeEvidenceLines =
        reportMode === "dispute" && latestResponse
          ? [
            `Decision: ${sanitizePdfText(latestResponse.decision || "Unknown")}`,
            `Responded: ${sanitizePdfText(formatDateTime(latestResponse.responded_at || ""))}`,
            ``,
            `Response Metadata`,
            `IP Address: ${sanitizePdfText(latestResponse.ip_address || "Unknown")}`,
            `Device: ${formatDevice(latestResponse.user_agent)}`,
            `Browser: ${formatBrowser(latestResponse.user_agent)}`,
          ]
          : [];

      const cardWidth = CONTENT_WIDTH;

      const descLines = description
        ? wrapParagraphs(description, font, 10.5, cardWidth - 40)
        : [];

      const visibleDescLines = descLines.slice(0, 3);
      const descHeight = visibleDescLines.length > 0 ? visibleDescLines.length * 14 + 6 : 0;
      const evidenceHeight =
        disputeEvidenceLines.length > 0 ? disputeEvidenceLines.length * 14 + 10 : 0;
      const attachmentHeight =
        approvalAttachments.length > 0 ? approvalAttachments.length * 14 + 10 : 0;

      const approvalPreviewBoxW = 120;
      const approvalPreviewBoxH = 140;
      const approvalPreviewGap = 10;

      const approvalImageHeight =
        imageApprovalAttachments.length > 0
          ? imageApprovalAttachments.slice(0, 2).length * (approvalPreviewBoxH + approvalPreviewGap) + 6
          : 0;

      const cardHeight = 122 + descHeight + evidenceHeight + attachmentHeight + approvalImageHeight;

      if (y - cardHeight < MARGIN + 24) {
        pageNumber += 1;

        page = addTimelinePage(
          pdf,
          font,
          fontBold,
          project.title || "Project",
          pageNumber,
          { reportMode, timelineHash }
        );

        y = PAGE_HEIGHT - MARGIN - 64;

        page.drawText("Project Timeline", {
          x: MARGIN,
          y,
          size: 18,
          font: fontBold,
          color: COLORS.navy3,
        });

        y -= 26;

        page.drawText("Chronological record of entries, photos, and attached files.", {
          x: MARGIN,
          y,
          size: 10.5,
          font,
          color: COLORS.muted,
        });

        y -= 28;
      }

      const cardX = MARGIN;
      const cardY = y - cardHeight;
      const top = y;

      page.drawRectangle({
        x: cardX,
        y: cardY,
        width: cardWidth,
        height: cardHeight,
        borderWidth: 1,
        borderColor: COLORS.line,
        color: COLORS.white,
      });

      page.drawRectangle({
        x: cardX,
        y: cardY,
        width: 8,
        height: cardHeight,
        borderWidth: 0,
        color: COLORS.navy2,
      });

      page.drawText("Approval Request", {
        x: cardX + 22,
        y: top - 24,
        size: 14,
        font: fontBold,
        color: COLORS.ink,
      });

      drawStatusBadge({
        page,
        text: statusLabel,
        xRight: cardX + cardWidth - 16,
        yTop: top - 16,
        fontBold,
        bgColor: badgeStyle.bg,
        textColor: badgeStyle.text,
      });

      page.drawText(title, {
        x: cardX + 22,
        y: top - 46,
        size: 12,
        font: fontBold,
        color: COLORS.text,
      });

      page.drawText(`Type: ${type}`, {
        x: cardX + 22,
        y: top - 64,
        size: 10.5,
        font,
        color: COLORS.muted,
      });

      page.drawText(`Cost Impact: ${costImpact}`, {
        x: cardX + 22,
        y: top - 82,
        size: 10.5,
        font,
        color: COLORS.text,
      });

      page.drawText(`Schedule Impact: ${scheduleImpact}`, {
        x: cardX + 240,
        y: top - 82,
        size: 10.5,
        font,
        color: COLORS.text,
      });

      page.drawText(`Sent: ${sentAt}`, {
        x: cardX + 22,
        y: top - 100,
        size: 10,
        font,
        color: COLORS.muted,
      });

      if (respondedAt) {
        page.drawText(`Responded: ${respondedAt}`, {
          x: cardX + 240,
          y: top - 100,
          size: 10,
          font,
          color: COLORS.muted,
        });
      }

      let detailY = top - 118;

      if (visibleDescLines.length > 0) {
        for (const line of visibleDescLines) {
          page.drawText(line, {
            x: cardX + 22,
            y: detailY,
            size: 10.5,
            font,
            color: COLORS.text,
          });

          detailY -= 14;
        }

        detailY -= 2;
      }

      if (disputeEvidenceLines.length > 0) {
        page.drawLine({
          start: { x: cardX + 22, y: detailY + 4 },
          end: { x: cardX + cardWidth - 18, y: detailY + 4 },
          thickness: 1,
          color: COLORS.line,
        });

        detailY -= 12;

        page.drawText("Approval Response Details", {
          x: cardX + 22,
          y: detailY,
          size: 10,
          font: fontBold,
          color: COLORS.text,
        });

        detailY -= 16;

        for (const line of disputeEvidenceLines) {
          if (!line.trim()) {
            detailY -= 4;
            continue;
          }

          const wrappedLines = wrapParagraphs(line, font, 9.5, cardWidth - 40);

          for (const wrappedLine of wrappedLines) {
            page.drawText(wrappedLine, {
              x: cardX + 22,
              y: detailY,
              size: 9.5,
              font,
              color: line === "Response Metadata" ? COLORS.text : COLORS.muted,
            });

            detailY -= 12;
          }
        }
      }

      if (approvalAttachments.length > 0) {
        page.drawLine({
          start: { x: cardX + 22, y: detailY + 4 },
          end: { x: cardX + cardWidth - 18, y: detailY + 4 },
          thickness: 1,
          color: COLORS.line,
        });

        detailY -= 12;

        page.drawText("Attachments:", {
          x: cardX + 22,
          y: detailY,
          size: 9.5,
          font: fontBold,
          color: COLORS.text,
        });

        detailY -= 14;

        for (const attachment of approvalAttachments) {
          page.drawText(`• ${sanitizePdfText(attachment.filename || "Attachment")}`, {
            x: cardX + 22,
            y: detailY,
            size: 9.5,
            font,
            color: COLORS.muted,
          });

          detailY -= 14;
        }
      }

      if (imageApprovalAttachments.length > 0) {
        detailY -= 6;

        const imagesToShow = imageApprovalAttachments.slice(0, 2);

        for (const img of imagesToShow) {
          const boxX = cardX + 22;
          const boxY = detailY - approvalPreviewBoxH;

          page.drawRectangle({
            x: boxX,
            y: boxY,
            width: approvalPreviewBoxW,
            height: approvalPreviewBoxH,
            borderWidth: 1,
            borderColor: COLORS.line,
            color: COLORS.soft,
          });

          page.drawRectangle({
            x: boxX + 1,
            y: boxY + 1,
            width: approvalPreviewBoxW - 2,
            height: 20,
            borderWidth: 0,
            color: COLORS.white,
          });

          try {
            const embedded = await loadEmbeddedImage(pdf, supabase, {
              id: img.id,
              project_id: img.project_id,
              proof_id: 0,
              filename: img.filename,
              mime_type: img.mime_type,
              path: img.path,
              created_at: img.created_at,
            });

            if (embedded) {
              const fit = fitInside(
                embedded.width,
                embedded.height,
                approvalPreviewBoxW - 12,
                approvalPreviewBoxH - 30
              );

              const imgX = boxX + (approvalPreviewBoxW - fit.width) / 2;
              const imgY = boxY + 6 + (approvalPreviewBoxH - 30 - fit.height) / 2;

              page.drawImage(embedded.image, {
                x: imgX,
                y: imgY,
                width: fit.width,
                height: fit.height,
              });
            } else {
              page.drawText("Preview unavailable", {
                x: boxX + 10,
                y: boxY + 60,
                size: 8.5,
                font,
                color: COLORS.muted,
              });
            }
          } catch {
            // fail silently — do not break PDF
          }

          page.drawText(trimFilename(img.filename || "Attachment", 22), {
            x: boxX + 6,
            y: boxY + 6,
            size: 8,
            font,
            color: COLORS.muted,
          });

          detailY -= approvalPreviewBoxH + approvalPreviewGap;
        }
      }

      y = cardY - 18;

      continue;
    }
    const proof = item.proof;
    const proofAtts = (byProofId.get(proof.id) ?? []).sort((a, b) => {
      return new Date(a.created_at ?? "").getTime() - new Date(b.created_at ?? "").getTime();
    });

    const embeddableImages = proofAtts.filter(isEmbeddableImage);
    const otherFiles = proofAtts.filter((a) => !isEmbeddableImage(a));

    const noteText = sanitizePdfText((proof.content ?? "").trim() || "No note added.");
    const noteLines = wrapParagraphs(noteText, font, 11.5, CONTENT_WIDTH - 52);
    const noteHeight = Math.max(24, noteLines.length * 15.5);

    const imageRows = Math.ceil(embeddableImages.length / 2);
    const imagesHeight = embeddableImages.length > 0 ? imageRows * 192 + 26 : 0;
    const filesHeight = otherFiles.length > 0 ? 34 + otherFiles.length * 15 : 0;

    const cardHeight = 100 + noteHeight + imagesHeight + filesHeight + 18;

    if (y - cardHeight < MARGIN + 24) {
      pageNumber += 1;
      page = addTimelinePage(
        pdf,
        font,
        fontBold,
        project.title || "Project",
        pageNumber,
        { reportMode, timelineHash }
      );
      y = PAGE_HEIGHT - MARGIN - 64;

      page.drawText("Project Timeline", {
        x: MARGIN,
        y,
        size: 18,
        font: fontBold,
        color: COLORS.navy3,
      });

      y -= 26;

      page.drawText("Chronological record of entries, photos, and attached files.", {
        x: MARGIN,
        y,
        size: 10.5,
        font,
        color: COLORS.muted,
      });

      y -= 28;
    }

    const cardX = MARGIN;
    const cardY = y - cardHeight;
    const cardWidth = CONTENT_WIDTH;
    const top = y;

    page.drawRectangle({
      x: cardX,
      y: cardY,
      width: cardWidth,
      height: cardHeight,
      borderWidth: 1,
      borderColor: COLORS.line,
      color: COLORS.white,
    });

    page.drawRectangle({
      x: cardX,
      y: cardY,
      width: 8,
      height: cardHeight,
      borderWidth: 0,
      color: proof.locked_at ? COLORS.navy3 : COLORS.softBlue,
    });

    page.drawRectangle({
      x: cardX,
      y: top - 6,
      width: cardWidth,
      height: 6,
      borderWidth: 0,
      color: proof.locked_at ? COLORS.navy3 : COLORS.navy2,
    });

    page.drawRectangle({
      x: cardX + 8,
      y: top - 60,
      width: cardWidth - 8,
      height: 54,
      borderWidth: 0,
      color: COLORS.soft,
    });

    page.drawText(`Entry ${i + 1}`, {
      x: cardX + 22,
      y: top - 25,
      size: 14,
      font: fontBold,
      color: COLORS.ink,
    });

    page.drawText(sanitizePdfText(formatDateTime(proof.created_at)), {
      x: cardX + 22,
      y: top - 43,
      size: 9.5,
      font,
      color: COLORS.muted,
    });

    drawBadge({
      page,
      text: proof.locked_at ? "Finalized" : "Draft",
      xRight: cardX + cardWidth - 16,
      yTop: top - 16,
      fontBold,
      finalized: !!proof.locked_at,
    });

    let cursorY = top - 82;

    page.drawText("Project Note", {
      x: cardX + 22,
      y: cursorY,
      size: 9.5,
      font: fontBold,
      color: COLORS.muted,
    });

    cursorY -= 19;

    for (const line of noteLines) {
      page.drawText(sanitizePdfText(line), {
        x: cardX + 22,
        y: cursorY,
        size: 11.5,
        font,
        color: COLORS.text,
      });
      cursorY -= 15.5;
    }

    cursorY -= 8;

    if (embeddableImages.length > 0) {
      page.drawLine({
        start: { x: cardX + 22, y: cursorY + 2 },
        end: { x: cardX + cardWidth - 18, y: cursorY + 2 },
        thickness: 1,
        color: COLORS.line,
      });

      cursorY -= 15;

      page.drawText("Photos", {
        x: cardX + 22,
        y: cursorY,
        size: 9.5,
        font: fontBold,
        color: COLORS.muted,
      });

      cursorY -= 18;

      const imgBoxW = 250;
      const imgBoxH = 180;
      const imgGap = 12;

      for (let idx = 0; idx < embeddableImages.length; idx += 2) {
        const row = embeddableImages.slice(idx, idx + 2);

        for (let col = 0; col < row.length; col++) {
          const att = row[col];
          const boxX = cardX + 22 + col * (imgBoxW + imgGap);
          const boxY = cursorY - imgBoxH;

          page.drawRectangle({
            x: boxX,
            y: boxY,
            width: imgBoxW,
            height: imgBoxH,
            borderWidth: 1,
            borderColor: COLORS.line,
            color: COLORS.soft,
          });

          page.drawRectangle({
            x: boxX + 1,
            y: boxY + 1,
            width: imgBoxW - 2,
            height: 22,
            borderWidth: 0,
            color: COLORS.white,
          });

          const embedded = await loadEmbeddedImage(pdf, supabase, att);

          if (embedded) {
            const fit = fitInside(embedded.width, embedded.height, imgBoxW - 16, imgBoxH - 38);
            const imgX = boxX + (imgBoxW - fit.width) / 2;
            const imgY = boxY + 26 + (imgBoxH - 38 - fit.height) / 2;

            page.drawImage(embedded.image, {
              x: imgX,
              y: imgY,
              width: fit.width,
              height: fit.height,
            });

            const imageUrl = getAttachmentOpenUrl(att.id);
            if (imageUrl) {
              addLinkAnnotation(pdf, page, imageUrl, imgX, imgY, fit.width, fit.height);
            }
          } else {
            page.drawText("Preview unavailable", {
              x: boxX + 12,
              y: boxY + 82,
              size: 10,
              font,
              color: COLORS.muted,
            });
          }

          page.drawText(trimFilename(att.filename || "Photo", 38), {
            x: boxX + 8,
            y: boxY + 8,
            size: 8.5,
            font,
            color: COLORS.muted,
          });
        }

        cursorY -= imgBoxH + 12;
      }

      cursorY -= 2;
    }

    if (otherFiles.length > 0) {
      page.drawLine({
        start: { x: cardX + 22, y: cursorY + 2 },
        end: { x: cardX + cardWidth - 18, y: cursorY + 2 },
        thickness: 1,
        color: COLORS.line,
      });

      cursorY -= 15;

      page.drawText("Files", {
        x: cardX + 22,
        y: cursorY,
        size: 9.5,
        font: fontBold,
        color: COLORS.muted,
      });

      cursorY -= 17;

      for (const att of otherFiles) {
        page.drawText(`- ${buildFileLabel(att)}`, {
          x: cardX + 22,
          y: cursorY,
          size: 10,
          font,
          color: COLORS.text,
        });
        cursorY -= 15;
      }
    }

    y = cardY - 18;
  }

  if (reportMode === "dispute") {
    const sortedContactEvents = [...contactEvents].sort((a, b) => {
      return new Date(a.created_at ?? "").getTime() - new Date(b.created_at ?? "").getTime();
    });

    pageNumber += 1;
    page = addTimelinePage(
      pdf,
      font,
      fontBold,
      project.title || "Project",
      pageNumber,
      { reportMode, timelineHash }
    );
    y = PAGE_HEIGHT - MARGIN - 64;

    page.drawText("Client Communication Record", {
      x: MARGIN,
      y,
      size: 18,
      font: fontBold,
      color: COLORS.navy3,
    });

    y -= 26;

    page.drawText("Record of official client email changes for this project.", {
      x: MARGIN,
      y,
      size: 10.5,
      font,
      color: COLORS.muted,
    });

    y -= 28;

    if (sortedContactEvents.length === 0) {
      page.drawText("No client communication changes recorded for this project.", {
        x: MARGIN,
        y,
        size: 11,
        font,
        color: COLORS.text,
      });

      y -= 24;
    } else {
      for (let i = 0; i < sortedContactEvents.length; i++) {
        const event = sortedContactEvents[i];

        const createdAt = sanitizePdfText(
          event.created_at ? formatDateTime(event.created_at) : "Unknown date"
        );
        const previousEmail = sanitizePdfText(event.previous_email || "Not set");
        const newEmail = sanitizePdfText(event.new_email || "Not set");

        const rowHeight = 86;

        if (y - rowHeight < MARGIN + 24) {
          pageNumber += 1;
          page = addTimelinePage(
            pdf,
            font,
            fontBold,
            project.title || "Project",
            pageNumber,
            { reportMode, timelineHash }
          );
          y = PAGE_HEIGHT - MARGIN - 64;

          page.drawText("Client Communication Record", {
            x: MARGIN,
            y,
            size: 18,
            font: fontBold,
            color: COLORS.navy3,
          });

          y -= 26;

          page.drawText("Record of official client email changes for this project.", {
            x: MARGIN,
            y,
            size: 10.5,
            font,
            color: COLORS.muted,
          });

          y -= 28;
        }

        const cardX = MARGIN;
        const cardY = y - rowHeight;
        const cardWidth = CONTENT_WIDTH;

        page.drawRectangle({
          x: cardX,
          y: cardY,
          width: cardWidth,
          height: rowHeight,
          borderWidth: 1,
          borderColor: COLORS.line,
          color: COLORS.white,
        });

        page.drawText(`Communication Event ${i + 1}`, {
          x: cardX + 16,
          y: y - 20,
          size: 12,
          font: fontBold,
          color: COLORS.ink,
        });

        page.drawText(createdAt, {
          x: cardX + 16,
          y: y - 37,
          size: 9.5,
          font,
          color: COLORS.muted,
        });

        page.drawText("Official client email changed", {
          x: cardX + 16,
          y: y - 56,
          size: 10.5,
          font: fontBold,
          color: COLORS.text,
        });

        page.drawText(`From: ${previousEmail}`, {
          x: cardX + 16,
          y: y - 72,
          size: 10,
          font,
          color: COLORS.text,
        });

        page.drawText(`To: ${newEmail}`, {
          x: cardX + 260,
          y: y - 72,
          size: 10,
          font,
          color: COLORS.text,
        });

        y = cardY - 14;
      }
    }

    const sortedDeliveries = [...deliveries].sort((a, b) => {
      return new Date(a.created_at ?? "").getTime() - new Date(b.created_at ?? "").getTime();
    });

    pageNumber += 1;
    page = addTimelinePage(
      pdf,
      font,
      fontBold,
      project.title || "Project",
      pageNumber,
      { reportMode, timelineHash }
    );
    y = PAGE_HEIGHT - MARGIN - 64;

    page.drawText("Delivery History", {
      x: MARGIN,
      y,
      size: 18,
      font: fontBold,
      color: COLORS.navy3,
    });

    y -= 26;

    page.drawText("Record of sent project updates and delivery outcomes.", {
      x: MARGIN,
      y,
      size: 10.5,
      font,
      color: COLORS.muted,
    });

    y -= 28;

    if (sortedDeliveries.length === 0) {
      page.drawText("No delivery history available for this project.", {
        x: MARGIN,
        y,
        size: 11,
        font,
        color: COLORS.text,
      });

      y -= 24;
    } else {
      for (let i = 0; i < sortedDeliveries.length; i++) {
        const delivery = sortedDeliveries[i];

        const recipient = sanitizePdfText(delivery.to_address || "Unknown recipient");
        const status = sanitizePdfText(delivery.status || "unknown");
        const createdAt = sanitizePdfText(
          delivery.created_at ? formatDateTime(delivery.created_at) : "Unknown date"
        );
        const errorText = sanitizePdfText(delivery.error || "");

        const errorLines = errorText
          ? wrapParagraphs(errorText, font, 10, CONTENT_WIDTH - 40)
          : [];

        const rowHeight = 64 + (errorLines.length > 0 ? errorLines.length * 13 + 10 : 0);

        if (y - rowHeight < MARGIN + 24) {
          pageNumber += 1;
          page = addTimelinePage(
            pdf,
            font,
            fontBold,
            project.title || "Project",
            pageNumber,
            { reportMode, timelineHash }
          );
          y = PAGE_HEIGHT - MARGIN - 64;

          page.drawText("Delivery History", {
            x: MARGIN,
            y,
            size: 18,
            font: fontBold,
            color: COLORS.navy3,
          });

          y -= 26;

          page.drawText("Record of sent project updates and delivery outcomes.", {
            x: MARGIN,
            y,
            size: 10.5,
            font,
            color: COLORS.muted,
          });

          y -= 28;
        }

        const cardX = MARGIN;
        const cardY = y - rowHeight;
        const cardWidth = CONTENT_WIDTH;

        page.drawRectangle({
          x: cardX,
          y: cardY,
          width: cardWidth,
          height: rowHeight,
          borderWidth: 1,
          borderColor: COLORS.line,
          color: COLORS.white,
        });

        page.drawText(`Delivery ${i + 1}`, {
          x: cardX + 16,
          y: y - 20,
          size: 12,
          font: fontBold,
          color: COLORS.ink,
        });

        page.drawText(createdAt, {
          x: cardX + 16,
          y: y - 37,
          size: 9.5,
          font,
          color: COLORS.muted,
        });

        page.drawText(`Recipient: ${recipient}`, {
          x: cardX + 16,
          y: y - 54,
          size: 10.5,
          font,
          color: COLORS.text,
        });

        page.drawText(`Status: ${status}`, {
          x: cardX + 300,
          y: y - 54,
          size: 10.5,
          font: fontBold,
          color: status.toLowerCase() === "sent" ? COLORS.successText : COLORS.text,
        });

        let errorY = y - 72;
        if (errorLines.length > 0) {
          page.drawText("Error:", {
            x: cardX + 16,
            y: errorY,
            size: 10,
            font: fontBold,
            color: COLORS.muted,
          });

          errorY -= 14;

          for (const line of errorLines) {
            page.drawText(line, {
              x: cardX + 16,
              y: errorY,
              size: 10,
              font,
              color: COLORS.text,
            });
            errorY -= 13;
          }
        }

        y = cardY - 14;
      }
    }

    const sortedShareViews = [...shareViews].sort((a, b) => {
      return new Date(a.viewed_at ?? "").getTime() - new Date(b.viewed_at ?? "").getTime();
    });

    pageNumber += 1;
    page = addTimelinePage(
      pdf,
      font,
      fontBold,
      project.title || "Project",
      pageNumber,
      { reportMode, timelineHash }
    );
    y = PAGE_HEIGHT - MARGIN - 64;

    page.drawText("Project View Record", {
      x: MARGIN,
      y,
      size: 18,
      font: fontBold,
      color: COLORS.navy3,
    });

    y -= 26;

    page.drawText("Record of secure share-link views for this project.", {
      x: MARGIN,
      y,
      size: 10.5,
      font,
      color: COLORS.muted,
    });

    y -= 28;

    if (sortedShareViews.length === 0) {
      page.drawText("No project views recorded for this project.", {
        x: MARGIN,
        y,
        size: 11,
        font,
        color: COLORS.text,
      });
    } else {
      for (let i = 0; i < sortedShareViews.length; i++) {
        const view = sortedShareViews[i];

        const viewedAt = sanitizePdfText(
          view.viewed_at ? formatDateTime(view.viewed_at) : "Unknown date"
        );

        const rowHeight = 70;

        if (y - rowHeight < MARGIN + 24) {
          pageNumber += 1;
          page = addTimelinePage(
            pdf,
            font,
            fontBold,
            project.title || "Project",
            pageNumber,
            { reportMode, timelineHash }
          );
          y = PAGE_HEIGHT - MARGIN - 64;

          page.drawText("Project View Record", {
            x: MARGIN,
            y,
            size: 18,
            font: fontBold,
            color: COLORS.navy3,
          });

          y -= 26;

          page.drawText("Record of secure share-link views for this project.", {
            x: MARGIN,
            y,
            size: 10.5,
            font,
            color: COLORS.muted,
          });

          y -= 28;
        }

        const cardX = MARGIN;
        const cardY = y - rowHeight;
        const cardWidth = CONTENT_WIDTH;

        page.drawRectangle({
          x: cardX,
          y: cardY,
          width: cardWidth,
          height: rowHeight,
          borderWidth: 1,
          borderColor: COLORS.line,
          color: COLORS.white,
        });

        page.drawText(`View Event ${i + 1}`, {
          x: cardX + 16,
          y: y - 20,
          size: 12,
          font: fontBold,
          color: COLORS.ink,
        });

        page.drawText(viewedAt, {
          x: cardX + 16,
          y: y - 37,
          size: 9.5,
          font,
          color: COLORS.muted,
        });

        page.drawText("Project timeline accessed via secure share link", {
          x: cardX + 16,
          y: y - 56,
          size: 10.5,
          font,
          color: COLORS.text,
        });

        y = cardY - 14;
      }
    }
  }

  const pdfBuffer = await pdf.save();
  const safeTitle = sanitizePdfFilename(project.title || "BuildProof_Project").slice(0, 80);
  const filename = `BuildProof_${safeTitle}.pdf`;

  return { pdfBuffer, filename };
}

// ---------- Cover ----------
function addCoverPage(opts: {
  pdf: PDFDocument;
  font: any;
  fontBold: any;
  projectTitle: string;
  clientName: string;
  clientEmail: string;
  dateRangeText: string;
  counts: {
    entryCount: number;
    photoCount: number;
    fileCount: number;
    finalizedCount: number;
    approvalCount: number;
  };
  generatedAtIso: string;
  reportMode: "standard" | "dispute";
  timelineHash?: string | null;
}) {
  const {
    pdf,
    font,
    fontBold,
    projectTitle,
    clientName,
    clientEmail,
    dateRangeText,
    counts,
    generatedAtIso,
    reportMode,
    timelineHash,
  } = opts;

  const page = pdf.addPage(PAGE_SIZE);

  // Hero background
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 250,
    width: PAGE_WIDTH,
    height: 250,
    color: COLORS.navy,
  });

  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 292,
    width: PAGE_WIDTH,
    height: 42,
    color: COLORS.navy2,
  });

  page.drawRectangle({
    x: PAGE_WIDTH - 155,
    y: PAGE_HEIGHT - 250,
    width: 155,
    height: 250,
    color: COLORS.navy3,
    borderWidth: 0,
  });

  page.drawText("BuildProof", {
    x: MARGIN,
    y: PAGE_HEIGHT - 76,
    size: 30,
    font: fontBold,
    color: COLORS.white,
  });

  page.drawText(
    reportMode === "dispute"
      ? "Dispute Documentation Package"
      : "Professional Project Record",
    {
      x: MARGIN,
      y: PAGE_HEIGHT - 104,
      size: 14,
      font,
      color: rgb(0.88, 0.92, 1),
    }
  );

  const coverTitle = sanitizePdfText(projectTitle || "Project");
  const coverSubtitle = sanitizePdfText(
    reportMode === "dispute"
      ? "Chronological record of project activity captured during the course of work. Entries, approvals, attachments, delivery history, and access records are preserved to reflect their original state. Entries and approvals are finalized at the time of sending and remain unchanged in the project record."
      : "Documented timeline of project entries, photos, and attached files."
  );

  const coverTitleLines = wrapParagraphs(coverTitle, fontBold, 27, CONTENT_WIDTH);
  const coverSubtitleLines = wrapParagraphs(coverSubtitle, font, 11.5, CONTENT_WIDTH);

  let coverTextY = PAGE_HEIGHT - 330;

  for (const line of coverTitleLines) {
    page.drawText(line, {
      x: MARGIN,
      y: coverTextY,
      size: 27,
      font: fontBold,
      color: COLORS.ink,
    });
    coverTextY -= 31;
  }

  coverTextY -= 6;

  for (const line of coverSubtitleLines) {
    page.drawText(line, {
      x: MARGIN,
      y: coverTextY,
      size: 11.5,
      font,
      color: COLORS.muted,
    });
    coverTextY -= 16;
  }

  let nextSectionTop = coverTextY - 26;

  if (reportMode === "dispute") {
    const recordX = MARGIN;
    const recordY = PAGE_HEIGHT - 455;
    const recordW = CONTENT_WIDTH;
    const recordH = 172;

    page.drawRectangle({
      x: recordX,
      y: recordY,
      width: recordW,
      height: recordH,
      borderWidth: 1,
      borderColor: COLORS.line,
      color: COLORS.softBlue,
    });

    page.drawText("Official Project Record", {
      x: recordX + 18,
      y: recordY + recordH - 24,
      size: 12,
      font: fontBold,
      color: COLORS.navy3,
    });

    page.drawText("Client name:", {
      x: recordX + 34,
      y: recordY + recordH - 52,
      size: 10.5,
      font: fontBold,
      color: COLORS.text,
    });

    page.drawText(clientName, {
      x: recordX + 160,
      y: recordY + recordH - 52,
      size: 10.5,
      font,
      color: COLORS.text,
    });

    page.drawText("Official client email:", {
      x: recordX + 34,
      y: recordY + recordH - 80,
      size: 10.5,
      font: fontBold,
      color: COLORS.text,
    });

    page.drawText(clientEmail, {
      x: recordX + 160,
      y: recordY + recordH - 80,
      size: 10.5,
      font,
      color: COLORS.text,
    });

    page.drawText("Exported:", {
      x: recordX + 34,
      y: recordY + recordH - 108,
      size: 10.5,
      font: fontBold,
      color: COLORS.text,
    });

    page.drawText(formatDateTime(generatedAtIso), {
      x: recordX + 160,
      y: recordY + recordH - 108,
      size: 10.5,
      font,
      color: COLORS.text,
    });

    page.drawText("Report type:", {
      x: recordX + 34,
      y: recordY + recordH - 136,
      size: 10.5,
      font: fontBold,
      color: COLORS.text,
    });

    page.drawText("Dispute documentation package", {
      x: recordX + 160,
      y: recordY + recordH - 136,
      size: 10.5,
      font,
      color: COLORS.text,
    });

    const recordIntegrityLines = wrapParagraphs(
      "Entries and approvals are finalized at the time of sending and remain unchanged in the project record.",
      font,
      9.5,
      recordW - 68
    );

    let integrityY = recordY + recordH - 154;

    for (const line of recordIntegrityLines) {
      page.drawText(line, {
        x: recordX + 34,
        y: integrityY,
        size: 9.5,
        font,
        color: COLORS.muted,
      });

      integrityY -= 12;
    }

    const timezoneNoteLines = wrapParagraphs(
      "Times shown reflect the timezone at the time of export.",
      font,
      9.5,
      recordW - 68
    );

    integrityY -= 10;

    for (const line of timezoneNoteLines) {
      page.drawText(line, {
        x: recordX + 34,
        y: integrityY,
        size: 9.5,
        font,
        color: COLORS.muted,
      });

      integrityY -= 12;
    }

    nextSectionTop = recordY - 24;
  }

  const panelX = MARGIN;
  const panelY = nextSectionTop - 188;
  const panelW = CONTENT_WIDTH;
  const panelH = 188;

  page.drawRectangle({
    x: panelX,
    y: panelY,
    width: panelW,
    height: panelH,
    borderWidth: 1,
    borderColor: COLORS.line,
    color: COLORS.white,
  });

  page.drawRectangle({
    x: panelX,
    y: panelY + panelH - 44,
    width: panelW,
    height: 44,
    borderWidth: 0,
    color: COLORS.soft,
  });

  page.drawText("Project Summary", {
    x: panelX + 18,
    y: panelY + panelH - 27,
    size: 12,
    font: fontBold,
    color: COLORS.ink,
  });

  drawMetaBlock(
    page,
    font,
    fontBold,
    "Date range",
    dateRangeText,
    panelX + 18,
    panelY + panelH - 72
  );
  drawMetaBlock(
    page,
    font,
    fontBold,
    "Entries",
    String(counts.entryCount),
    panelX + 308,
    panelY + panelH - 72
  );

  drawMetaBlock(
    page,
    font,
    fontBold,
    "Photos",
    String(counts.photoCount),
    panelX + 18,
    panelY + panelH - 132
  );
  drawMetaBlock(
    page,
    font,
    fontBold,
    "Files",
    String(counts.fileCount),
    panelX + 168,
    panelY + panelH - 132
  );
  drawMetaBlock(
    page,
    font,
    fontBold,
    "Approvals",
    String(counts.approvalCount),
    panelX + 308,
    panelY + panelH - 132
  );

  page.drawLine({
    start: { x: MARGIN, y: 74 },
    end: { x: PAGE_WIDTH - MARGIN, y: 74 },
    thickness: 1,
    color: COLORS.line,
  });

  page.drawText(`Generated ${formatDateTime(generatedAtIso)}`, {
    x: MARGIN,
    y: 54,
    size: 9.5,
    font,
    color: COLORS.muted,
  });

  if (reportMode === "dispute" && timelineHash) {
    const shortHash = timelineHash.slice(0, 24);

    page.drawText("Integrity hash:", {
      x: PAGE_WIDTH - MARGIN - 260,
      y: 54,
      size: 9,
      font: fontBold,
      color: COLORS.muted,
    });

    page.drawText(shortHash, {
      x: PAGE_WIDTH - MARGIN - 160,
      y: 54,
      size: 9,
      font,
      color: COLORS.muted,
    });
  } else {
    page.drawText("Powered by BuildProof", {
      x: PAGE_WIDTH - MARGIN - 118,
      y: 54,
      size: 9.5,
      font: fontBold,
      color: COLORS.muted,
    });
  }
}

// ---------- Timeline page shell ----------
function addTimelinePage(
  pdf: PDFDocument,
  font: any,
  fontBold: any,
  projectTitle: string,
  pageNumber: number,
  opts?: { reportMode?: "standard" | "dispute"; timelineHash?: string | null }
) {
  const page = pdf.addPage(PAGE_SIZE);

  page.drawText("BuildProof Journal", {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN + 8,
    size: 11,
    font: fontBold,
    color: COLORS.ink,
  });

  page.drawText(sanitizePdfText(projectTitle), {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN - 8,
    size: 9.5,
    font,
    color: COLORS.muted,
  });

  page.drawText("Timeline", {
    x: PAGE_WIDTH - MARGIN - 42,
    y: PAGE_HEIGHT - MARGIN + 8,
    size: 11,
    font: fontBold,
    color: COLORS.ink,
  });

  page.drawLine({
    start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 18 },
    end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - MARGIN - 18 },
    thickness: 1,
    color: COLORS.line,
  });

  addPoweredByFooter(page, font, fontBold, opts);

  page.drawText(String(pageNumber), {
    x: PAGE_WIDTH - MARGIN - 6,
    y: 24,
    size: 9,
    font,
    color: COLORS.faint,
  });

  return page;
}

// ---------- Draw helpers ----------
function getApprovalStatusLabel(status: string | null) {
  const value = (status || "").toLowerCase();

  if (value === "approved") return "Approved";
  if (value === "declined") return "Declined";
  if (value === "pending") return "Pending";
  if (value === "expired") return "Expired";
  if (value === "draft") return "Draft";

  return "Unknown";
}

function getApprovalBadgeStyle(status: string | null) {
  const value = (status || "").toLowerCase();

  if (value === "approved") {
    return { bg: COLORS.successBg, text: COLORS.successText };
  }

  if (value === "declined") {
    return { bg: COLORS.dangerBg, text: COLORS.dangerText };
  }

  if (value === "pending") {
    return { bg: COLORS.warningBg, text: COLORS.warningText };
  }

  if (value === "expired") {
    return { bg: COLORS.neutralBg, text: COLORS.neutralText };
  }

  if (value === "draft") {
    return { bg: COLORS.draftBg, text: COLORS.draftText };
  }

  return { bg: COLORS.neutralBg, text: COLORS.neutralText };
}

function drawStatusBadge(opts: {
  page: any;
  text: string;
  xRight: number;
  yTop: number;
  fontBold: any;
  bgColor: any;
  textColor: any;
}) {
  const { page, text, xRight, yTop, fontBold, bgColor, textColor } = opts;
  const size = 9;
  const padX = 8;
  const padY = 5;
  const textWidth = fontBold.widthOfTextAtSize(text, size);
  const w = textWidth + padX * 2;
  const h = size + padY * 2;
  const x = xRight - w;
  const y = yTop - h;

  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderWidth: 0,
    color: bgColor,
  });

  page.drawText(text, {
    x: x + padX,
    y: y + padY,
    size,
    font: fontBold,
    color: textColor,
  });
}
function drawMetaBlock(
  page: any,
  font: any,
  fontBold: any,
  label: string,
  value: string,
  x: number,
  y: number
) {
  page.drawText(sanitizePdfText(label), {
    x,
    y,
    size: 10,
    font: fontBold,
    color: COLORS.muted,
  });

  page.drawText(sanitizePdfText(value), {
    x,
    y: y - 18,
    size: 14,
    font,
    color: COLORS.ink,
  });
}

function drawBadge(opts: {
  page: any;
  text: string;
  xRight: number;
  yTop: number;
  fontBold: any;
  finalized: boolean;
}) {
  const { page, text, xRight, yTop, fontBold, finalized } = opts;
  const size = 9;
  const padX = 8;
  const padY = 5;
  const textWidth = fontBold.widthOfTextAtSize(text, size);
  const w = textWidth + padX * 2;
  const h = size + padY * 2;
  const x = xRight - w;
  const y = yTop - h;

  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderWidth: 0,
    color: finalized ? COLORS.successBg : COLORS.draftBg,
  });

  page.drawText(text, {
    x: x + padX,
    y: y + padY,
    size,
    font: fontBold,
    color: finalized ? COLORS.successText : COLORS.draftText,
  });
}

function addPoweredByFooter(
  page: any,
  font: any,
  fontBold: any,
  opts?: { reportMode?: "standard" | "dispute"; timelineHash?: string | null }
) {
  page.drawLine({
    start: { x: MARGIN, y: 40 },
    end: { x: PAGE_WIDTH - MARGIN, y: 40 },
    thickness: 1,
    color: COLORS.line,
  });

  if (opts?.reportMode === "dispute" && opts?.timelineHash) {
    const shortHash = opts.timelineHash.slice(0, 24);

    page.drawText("Integrity hash:", {
      x: MARGIN,
      y: 24,
      size: 9,
      font: fontBold,
      color: COLORS.muted,
    });

    page.drawText(shortHash, {
      x: MARGIN + 70,
      y: 24,
      size: 9,
      font,
      color: COLORS.muted,
    });
  } else {
    page.drawText("Powered by BuildProof", {
      x: MARGIN,
      y: 24,
      size: 9,
      font,
      color: COLORS.muted,
    });
  }

  page.drawText("This document reflects the state of records at time of export.", {
    x: MARGIN,
    y: 12,
    size: 8,
    font,
    color: COLORS.faint,
  });

  page.drawText("buildproof.app", {
    x: PAGE_WIDTH - MARGIN - 78,
    y: 24,
    size: 9,
    font: fontBold,
    color: COLORS.muted,
  });
}

function fitInside(srcW: number, srcH: number, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / srcW, maxH / srcH);
  return {
    width: Math.max(1, srcW * ratio),
    height: Math.max(1, srcH * ratio),
  };
}

// ---------- Link annotations ----------
function addLinkAnnotation(
  pdf: PDFDocument,
  page: any,
  url: string,
  x: number,
  y: number,
  width: number,
  height: number
) {
  try {
    const linkDict = pdf.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: url,
      },
    });

    const linkRef = pdf.context.register(linkDict);

    const existingAnnots = page.node.Annots();
    if (existingAnnots) {
      existingAnnots.push(linkRef);
    } else {
      page.node.set(PDFName.of("Annots"), pdf.context.obj([linkRef]));
    }
  } catch {
    // fail silently so PDF generation never breaks
  }
}

function getAttachmentOpenUrl(attachmentId: string) {
  if (!APP_URL || !attachmentId) return null;
  return `${APP_URL}/api/attachments/open?id=${encodeURIComponent(attachmentId)}`;
}

// ---------- Image loading ----------
async function loadEmbeddedImage(pdf: PDFDocument, supabase: any, att: AttachmentRow) {
  try {
    const bucket = supabase.storage.from("attachments");
    const { data, error } = await bucket.download(att.path);
    if (error || !data) return null;

    const originalBytes = new Uint8Array(await data.arrayBuffer());

    const normalized = await normalizeImageForPdf({
      bytes: originalBytes,
      mimeType: att.mime_type || null,
      fileName: att.filename || null,
    });

    const image = await pdf.embedJpg(normalized.bytes);

    return {
      image,
      width: image.width,
      height: image.height,
    };
  } catch (error) {
    console.error("[pdf] failed to load attachment image", {
      attachmentId: att.id,
      filename: att.filename,
      mimeType: att.mime_type,
      path: att.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function isEmbeddableImage(att: AttachmentRow) {
  const mt = (att.mime_type || "").toLowerCase();
  const name = (att.filename || "").toLowerCase();

  return (
    mt.startsWith("image/") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".webp") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    name.endsWith(".avif") ||
    name.endsWith(".gif") ||
    name.endsWith(".bmp") ||
    name.endsWith(".tif") ||
    name.endsWith(".tiff")
  );
}

function buildFileLabel(att: AttachmentRow) {
  const name = sanitizePdfText(att.filename || "File");
  const mt = (att.mime_type || "").toLowerCase();

  if (mt.includes("pdf")) return `${name} (PDF)`;
  if (mt.includes("zip")) return `${name} (ZIP)`;
  if (mt.includes("msword") || mt.includes("officedocument")) return `${name} (document)`;
  if (mt.startsWith("image/")) return `${name} (image file)`;
  return `${name} (file)`;
}

// ---------- Misc helpers ----------
function getDateRange(
  proofs: ProofRow[],
  approvals: ApprovalWithResponseRow[] = []
) {
  const proofDates = (proofs ?? [])
    .map((p) => p.created_at)
    .filter(Boolean);

  const approvalDates = (approvals ?? [])
    .map((a) => a.sent_at || a.created_at)
    .filter(Boolean) as string[];

  const allDates = [...proofDates, ...approvalDates].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  if (allDates.length === 0) return "-";

  const first = allDates[0];
  const last = allDates[allDates.length - 1];
  const a = formatDate(first);
  const b = formatDate(last);

  return a === b ? a : `${a} - ${b}`;
}

function getCounts(
  proofs: ProofRow[],
  attachments: AttachmentRow[],
  approvals: ApprovalWithResponseRow[] = []
) {
  const entryCount = proofs?.length ?? 0;
  const finalizedCount = (proofs ?? []).filter((e) => !!e.locked_at).length;

  let photoCount = 0;
  let fileCount = 0;

  for (const att of attachments ?? []) {
    const mt = (att.mime_type || "").toLowerCase();
    if (mt.startsWith("image/")) photoCount += 1;
    else fileCount += 1;
  }

  return {
    entryCount,
    photoCount,
    fileCount,
    finalizedCount,
    approvalCount: approvals?.length ?? 0,
  };
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function wrapParagraphs(text: string, font: any, fontSize: number, maxWidth: number) {
  const safe = sanitizePdfText(text ?? "");
  const paragraphs = safe.split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const width = font.widthOfTextAtSize(test, fontSize);

      if (width <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }

    if (line) lines.push(line);
  }

  return lines.length ? lines : [""];
}

function trimFilename(name: string, max: number) {
  const s = sanitizePdfText(name || "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

// ---------- Critical: prevent WinAnsi encoding crashes ----------
function sanitizePdfText(input: string) {
  const s = String(input ?? "");
  const normalized = s
    .replace(/\u2014|\u2013/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/\u2022/g, "-")
    .replace(/\u2713/g, "OK")
    .replace(/\u00A0/g, " ");

  let out = "";
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    const ch = normalized[i];

    if (ch === "\n" || ch === "\r" || ch === "\t") {
      out += ch;
      continue;
    }

    if (code >= 32 && code <= 255) out += ch;
    else out += "?";
  }

  return out;
}

function sanitizePdfFilename(name: string) {
  return String(name || "BuildProof_Project").replace(/[^\w\-]+/g, "_");
}

function formatDevice(ua?: string | null) {
  if (!ua) return "Unknown";
  if (ua.includes("iPhone")) return "iPhone";
  if (ua.includes("Android")) return "Android device";
  return "Unknown device";
}

function formatBrowser(ua?: string | null) {
  if (!ua) return "Unknown";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Chrome")) return "Chrome";
  return "Unknown browser";
}