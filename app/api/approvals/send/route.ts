import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { createApprovalToken } from "@/lib/approvals/createApprovalToken";
import { hashApprovalToken } from "@/lib/approvals/hashApprovalToken";
import { canSendApproval } from "@/lib/approvals/approvalStatusGuards";
import { canUserAccessProject } from "@/lib/organizationAuth";

export async function POST(req: Request) {
    try {
        const { user, errorResponse } = await requireUser(req);
        if (!user) return errorResponse;

        const body = await req.json();
        const approvalId = String(body?.approvalId ?? "").trim();

        if (!approvalId) {
            return NextResponse.json({ error: "Missing approvalId." }, { status: 400 });
        }

        const { data: approval, error: approvalError } = await supabaseServer
            .from("approval_requests")
            .select("*")
            .eq("id", approvalId)
            .single();

        if (approvalError || !approval) {
            return NextResponse.json({ error: "Approval not found." }, { status: 404 });
        }

        if (!(await canUserAccessProject(user.id, approval.project_id))) {
            return NextResponse.json({ error: "Not authorized." }, { status: 403 });
        }

        if (!canSendApproval(approval.status)) {
            return NextResponse.json({
                approval,
                alreadySent: true,
            });
        }

        if (!approval.title?.trim()) {
            return NextResponse.json({ error: "Missing title." }, { status: 400 });
        }

        if (!approval.approval_type?.trim()) {
            return NextResponse.json({ error: "Missing approval type." }, { status: 400 });
        }

        if (!approval.description?.trim()) {
            return NextResponse.json({ error: "Missing description." }, { status: 400 });
        }

        if (!approval.recipient_email?.trim()) {
            return NextResponse.json({ error: "Missing recipient email." }, { status: 400 });
        }

        const { data: attachments, error: attachmentsError } = await supabaseServer
            .from("approval_attachments")
            .select("id, filename, approval_id")
            .eq("approval_id", approval.id);

        if (attachmentsError) {
            console.error("[approvals/send] attachments fetch error", attachmentsError);
            return NextResponse.json(
                { error: "Failed to load approval attachments." },
                { status: 500 }
            );
        }

        const expectedAttachmentCount = Number(body?.expectedAttachmentCount ?? 0);
        const actualAttachmentCount = Array.isArray(attachments) ? attachments.length : 0;

        if (expectedAttachmentCount > 0 && actualAttachmentCount < expectedAttachmentCount) {
            return NextResponse.json(
                { error: "Attachments still syncing. Please retry." },
                { status: 409 }
            );
        }

        const sentAt = new Date().toISOString();

        const { data: claimedApproval, error: claimError } = await supabaseServer
            .from("approval_requests")
            .update({
                status: "pending",
                sent_at: sentAt,
                updated_at: sentAt,
            })
            .eq("id", approval.id)
            .eq("status", "draft")
            .select("*")
            .single();

        if (claimError || !claimedApproval) {
            console.error("[approvals/send] approval claim skipped/error", claimError);

            return NextResponse.json({
                approval,
                alreadySent: true,
            });
        }

        const rawToken = createApprovalToken();
        const tokenHash = hashApprovalToken(rawToken);

        const { error: deleteOldTokenError } = await supabaseServer
            .from("approval_tokens")
            .delete()
            .eq("approval_request_id", approval.id);

        if (deleteOldTokenError) {
            console.error("[approvals/send] delete old token error", deleteOldTokenError);

            await supabaseServer
                .from("approval_requests")
                .update({
                    status: "draft",
                    sent_at: null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", approval.id)
                .eq("status", "pending");

            return NextResponse.json(
                { error: "Failed to prepare approval token." },
                { status: 500 }
            );
        }

        const { error: tokenInsertError } = await supabaseServer
            .from("approval_tokens")
            .insert({
                approval_request_id: approval.id,
                token_hash: tokenHash,
                expires_at: null,
                used_at: null,
            });

        if (tokenInsertError) {
            console.error("[approvals/send] token insert error", tokenInsertError);

            await supabaseServer
                .from("approval_requests")
                .update({
                    status: "draft",
                    sent_at: null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", approval.id)
                .eq("status", "pending");

            return NextResponse.json(
                { error: "Failed to save approval token." },
                { status: 500 }
            );
        }

        const origin =
            process.env.NEXT_PUBLIC_APP_URL?.trim() ||
            "https://app.buildproof.app";

        console.log("[approvals/send] origin =", origin);

        const reviewUrl = `${origin}/approval/${rawToken}`;

        const approvalTypeLabel =
            approval.approval_type === "change_order"
                ? "Additional Charge"
                : approval.approval_type === "scope"
                    ? "Scope"
                    : approval.approval_type === "material"
                        ? "Material"
                        : approval.approval_type === "schedule"
                            ? "Schedule"
                            : "General";

        const attachmentTextLines =
            attachments && attachments.length
                ? attachments.map((attachment) => {
                    const url = `${origin}/api/attachments/open?id=${attachment.id}&kind=approval`;
                    return `- ${attachment.filename || "Attachment"}: ${url}`;
                })
                : [];

        const hasLineItems =
            Array.isArray(approval.line_items) && approval.line_items.length > 0;

        const lineItemsTotal = hasLineItems
            ? approval.line_items.reduce(
                (sum: number, li: any) => sum + (Number(li.line_total) || 0),
                0
            )
            : 0;

        const lineItemsTextLines = hasLineItems
            ? [
                `Line items:`,
                ...approval.line_items.map(
                    (li: any) =>
                        `- ${li.description} (${li.quantity} x $${li.unit_cost}): $${Number(
                            li.line_total
                        ).toFixed(2)}`
                ),
                `Total: $${lineItemsTotal.toFixed(2)}`,
            ]
            : [];

        const subject = `Approval requested: ${approval.title}`;

        const text = [
            `Approval requested`,
            ``,
            `Title: ${approval.title}`,
            `Type: ${approvalTypeLabel}`,
            ``,
            `Description:`,
            `${approval.description}`,
            ``,
            ...(hasLineItems
                ? lineItemsTextLines
                : approval.cost_delta !== null
                    ? [`Cost impact: ${approval.cost_delta}`]
                    : []),
            approval.schedule_delta ? `Schedule impact: ${approval.schedule_delta}` : null,
            approval.due_at ? `Due date: ${approval.due_at}` : null,
            attachments && attachments.length ? `` : null,
            attachments && attachments.length ? `Attachments:` : null,
            ...attachmentTextLines,
            ``,
            `Review and respond: ${reviewUrl}`,
        ]
            .filter(Boolean)
            .join("\n");

        const attachmentsHtml =
            attachments && attachments.length
                ? `
          <div style="margin:0 0 16px 0;padding:12px;border:1px solid rgba(15,23,42,0.08);border-radius:10px;background:#f8fafc;">
            <div style="font-weight:700;margin-bottom:8px;color:#0f172a;">Attachments</div>
            ${attachments
                    .map((attachment) => {
                        const url = `${origin}/api/attachments/open?id=${attachment.id}&kind=approval`;
                        return `
                  <div style="margin-bottom:6px;">
                    <a
                      href="${escapeAttr(url)}"
                      style="color:#1d4ed8;text-decoration:none;overflow-wrap:anywhere;word-break:break-word;"
                    >
                      ${escapeHtml(attachment.filename || "Attachment")}
                    </a>
                  </div>
                `;
                    })
                    .join("")}
          </div>
        `
                : "";

        const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;">
        <div style="font-size:12px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:#2563eb;margin-bottom:10px;">
          Approval Request
        </div>

        <h1 style="font-size:24px;line-height:1.2;margin:0 0 10px 0;color:#0f172a;">
          ${escapeHtml(approval.title)}
        </h1>

        <p style="margin:0 0 14px 0;color:#475569;">
          ${escapeHtml(approvalTypeLabel)}
        </p>

        <div style="margin:0 0 16px 0;color:#334155;white-space:pre-wrap;">
          ${escapeHtml(approval.description)}
        </div>

        ${hasLineItems
                ? `
          <div style="margin:0 0 18px 0;padding:14px;border:1px solid rgba(15,23,42,0.08);border-radius:12px;background:#f8fafc;">
            <div style="font-weight:700;margin-bottom:8px;color:#0f172a;">Line Items</div>
            ${approval.line_items
                    .map((li: any) => {
                        return `
                <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:6px;color:#334155;">
                  <span>${escapeHtml(String(li.description))} (${escapeHtml(String(li.quantity))} &times; $${escapeHtml(String(li.unit_cost))})</span>
                  <span style="font-weight:700;white-space:nowrap;">$${escapeHtml(Number(li.line_total).toFixed(2))}</span>
                </div>
              `;
                    })
                    .join("")}
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(15,23,42,0.08);display:flex;justify-content:space-between;font-weight:800;color:#0f172a;">
              <span>Total</span>
              <span>$${escapeHtml(lineItemsTotal.toFixed(2))}</span>
            </div>
          </div>
        `
                : ""
            }

        ${(!hasLineItems && approval.cost_delta !== null) || approval.schedule_delta || approval.due_at
                ? `
          <div style="margin:0 0 18px 0;padding:14px;border:1px solid rgba(15,23,42,0.08);border-radius:12px;background:#f8fafc;">
            ${!hasLineItems && approval.cost_delta !== null
                    ? `<div style="margin:0 0 8px 0;"><strong>Cost impact:</strong> ${escapeHtml(String(approval.cost_delta))}</div>`
                    : ""
                }
            ${approval.schedule_delta
                    ? `<div style="margin:0 0 8px 0;"><strong>Schedule impact:</strong> ${escapeHtml(approval.schedule_delta)}</div>`
                    : ""
                }
            ${approval.due_at
                    ? `<div><strong>Due date:</strong> ${escapeHtml(String(approval.due_at))}</div>`
                    : ""
                }
          </div>
        `
                : ""
            }

        ${attachmentsHtml}

        <p style="margin:0 0 12px 0;">
          Please review this request and submit your decision below.
        </p>

        <p style="margin:0 0 18px 0;">
          <a
            href="${escapeAttr(reviewUrl)}"
            style="display:inline-block;padding:12px 16px;border-radius:10px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;"
          >
            Review & Respond
          </a>
        </p>

        <p style="margin:0;color:#64748b;font-size:13px;">
          Powered by Leeward
        </p>
      </div>
    `;

        const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL,
                to: [approval.recipient_email],
                subject,
                text,
                html,
            }),
        });

        const emailJson = await emailRes.json().catch(() => ({}));

        if (!emailRes.ok) {
            console.error("[approvals/send] email error", emailJson);

            await supabaseServer
                .from("approval_tokens")
                .delete()
                .eq("approval_request_id", approval.id);

            await supabaseServer
                .from("approval_requests")
                .update({
                    status: "draft",
                    sent_at: null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", approval.id)
                .eq("status", "pending");

            return NextResponse.json(
                { error: emailJson?.message || emailJson?.error || "Failed to send approval email." },
                { status: 500 }
            );
        }

        return NextResponse.json({
            approval: claimedApproval,
            reviewUrl,
        });
    } catch (error: any) {
        console.error("[approvals/send] unexpected error", error);
        return NextResponse.json(
            { error: error?.message || "Unexpected server error." },
            { status: 500 }
        );
    }
}

function escapeHtml(input: string) {
    return String(input || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeAttr(input: string) {
    return escapeHtml(input).replace(/"/g, "&quot;");
}
