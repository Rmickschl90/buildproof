import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  getUserOrganizationContext,
  canUserManageOrganization,
} from "@/lib/organizationAuth";
import { createInviteToken } from "@/lib/organizationInvites/createInviteToken";
import { hashInviteToken } from "@/lib/organizationInvites/hashInviteToken";

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
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

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Missing email." }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    const context = await getUserOrganizationContext(user.id);
    if (!context) {
      return NextResponse.json(
        { error: "You do not belong to an organization." },
        { status: 403 }
      );
    }

    const canManage = await canUserManageOrganization(user.id, context.organizationId);
    if (!canManage) {
      return NextResponse.json(
        { error: "Only the organization owner can invite members." },
        { status: 403 }
      );
    }

    const { data: organization, error: orgError } = await supabaseServer
      .from("organizations")
      .select("id, name, member_limit")
      .eq("id", context.organizationId)
      .single();

    if (orgError || !organization) {
      console.error("[organization/invite] organization fetch error", orgError);
      return NextResponse.json(
        { error: "Failed to load organization." },
        { status: 500 }
      );
    }

    const nowIso = new Date().toISOString();

    const { count: activeMemberCount, error: memberCountError } = await supabaseServer
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .is("removed_at", null);

    if (memberCountError) {
      console.error("[organization/invite] member count error", memberCountError);
      return NextResponse.json(
        { error: "Failed to check organization capacity." },
        { status: 500 }
      );
    }

    const { count: pendingInviteCount, error: inviteCountError } = await supabaseServer
      .from("organization_invites")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", nowIso);

    if (inviteCountError) {
      console.error("[organization/invite] pending invite count error", inviteCountError);
      return NextResponse.json(
        { error: "Failed to check organization capacity." },
        { status: 500 }
      );
    }

    const totalCount = (activeMemberCount ?? 0) + (pendingInviteCount ?? 0);

    if (totalCount >= organization.member_limit) {
      return NextResponse.json(
        {
          error: `This organization has reached its member limit (${organization.member_limit}).`,
        },
        { status: 409 }
      );
    }

    const rawToken = createInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS).toISOString();

    const { data: invite, error: inviteInsertError } = await supabaseServer
      .from("organization_invites")
      .insert({
        organization_id: organization.id,
        email,
        role: "member",
        token_hash: tokenHash,
        invited_by: user.id,
        expires_at: expiresAt,
      })
      .select("id, email, role, expires_at")
      .single();

    if (inviteInsertError || !invite) {
      console.error("[organization/invite] insert error", inviteInsertError);
      return NextResponse.json(
        { error: "Failed to create invite." },
        { status: 500 }
      );
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ||
      "https://app.getleeward.com";

    const inviteUrl = `${origin}/invite/${rawToken}`;

    const subject = `You've been invited to join ${organization.name} on Leeward`;

    const text = [
      `You've been invited to join ${organization.name} on Leeward.`,
      ``,
      `Accept your invite: ${inviteUrl}`,
      ``,
      `This invite expires in 7 days.`,
    ].join("\n");

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;">
        <div style="font-size:12px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:#2563eb;margin-bottom:10px;">
          Team Invite
        </div>

        <h1 style="font-size:24px;line-height:1.2;margin:0 0 10px 0;color:#0f172a;">
          Join ${escapeHtml(organization.name)} on Leeward
        </h1>

        <p style="margin:0 0 18px 0;color:#475569;">
          You've been invited to join this team. Click below to accept.
        </p>

        <p style="margin:0 0 18px 0;">
          <a
            href="${escapeAttr(inviteUrl)}"
            style="display:inline-block;padding:12px 16px;border-radius:10px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;"
          >
            Accept Invite
          </a>
        </p>

        <p style="margin:0 0 8px 0;color:#64748b;font-size:13px;">
          This invite expires in 7 days.
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
        to: [email],
        subject,
        text,
        html,
      }),
    });

    const emailJson = await emailRes.json().catch(() => ({}));

    if (!emailRes.ok) {
      console.error("[organization/invite] email error", emailJson);

      await supabaseServer.from("organization_invites").delete().eq("id", invite.id);

      return NextResponse.json(
        { error: emailJson?.message || emailJson?.error || "Failed to send invite email." },
        { status: 500 }
      );
    }

    return NextResponse.json({ invite, inviteUrl });
  } catch (error: any) {
    console.error("[organization/invite] unexpected error", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
