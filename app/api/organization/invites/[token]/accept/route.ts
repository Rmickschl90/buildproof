import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { getUserOrganizationContext } from "@/lib/organizationAuth";
import { hashInviteToken } from "@/lib/organizationInvites/hashInviteToken";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const { token } = await ctx.params;

    if (!token) {
      return NextResponse.json({ error: "Missing token." }, { status: 400 });
    }

    const tokenHash = hashInviteToken(token);

    const { data: invite, error: inviteError } = await supabaseServer
      .from("organization_invites")
      .select("id, organization_id, email, role, expires_at, accepted_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (inviteError) {
      console.error("[organization/invites/[token]/accept] lookup error", inviteError);
      return NextResponse.json(
        { error: "Failed to look up invite." },
        { status: 500 }
      );
    }

    if (!invite) {
      return NextResponse.json({ error: "Invalid invite link." }, { status: 404 });
    }

    if (invite.revoked_at) {
      return NextResponse.json(
        { error: "This invite has been revoked." },
        { status: 410 }
      );
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "This invite has expired." },
        { status: 410 }
      );
    }

    if (invite.accepted_at) {
      return NextResponse.json(
        { error: "This invite has already been accepted." },
        { status: 409 }
      );
    }

    const userEmail = String(user.email ?? "").trim().toLowerCase();
    const inviteEmail = String(invite.email ?? "").trim().toLowerCase();

    if (!userEmail || userEmail !== inviteEmail) {
      return NextResponse.json(
        { error: "This invite was sent to a different email address." },
        { status: 403 }
      );
    }

    const context = await getUserOrganizationContext(user.id);
    if (context) {
      if (context.organizationId === invite.organization_id) {
        return NextResponse.json(
          { error: "You are already a member of this organization." },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "You already belong to a different organization." },
        { status: 409 }
      );
    }

    const { data: organization, error: orgError } = await supabaseServer
      .from("organizations")
      .select("id, name, member_limit")
      .eq("id", invite.organization_id)
      .single();

    if (orgError || !organization) {
      console.error("[organization/invites/[token]/accept] organization fetch error", orgError);
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
      console.error("[organization/invites/[token]/accept] member count error", memberCountError);
      return NextResponse.json(
        { error: "Failed to check organization capacity." },
        { status: 500 }
      );
    }

    const { count: otherPendingInviteCount, error: inviteCountError } = await supabaseServer
      .from("organization_invites")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", nowIso)
      .neq("id", invite.id);

    if (inviteCountError) {
      console.error("[organization/invites/[token]/accept] pending invite count error", inviteCountError);
      return NextResponse.json(
        { error: "Failed to check organization capacity." },
        { status: 500 }
      );
    }

    const totalCount = (activeMemberCount ?? 0) + (otherPendingInviteCount ?? 0);

    if (totalCount >= organization.member_limit) {
      return NextResponse.json(
        {
          error: `This organization has reached its member limit (${organization.member_limit}).`,
        },
        { status: 409 }
      );
    }

    const { data: claimedInvite, error: claimError } = await supabaseServer
      .from("organization_invites")
      .update({ accepted_at: nowIso })
      .eq("id", invite.id)
      .is("accepted_at", null)
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error("[organization/invites/[token]/accept] claim error", claimError);
      return NextResponse.json(
        { error: "Failed to accept invite." },
        { status: 500 }
      );
    }

    if (!claimedInvite) {
      return NextResponse.json(
        { error: "This invite has already been accepted." },
        { status: 409 }
      );
    }

    const { error: memberInsertError } = await supabaseServer
      .from("organization_members")
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        role: invite.role,
      });

    if (memberInsertError) {
      console.error("[organization/invites/[token]/accept] member insert error", memberInsertError);

      await supabaseServer
        .from("organization_invites")
        .update({ accepted_at: null })
        .eq("id", invite.id);

      if (memberInsertError.code === "23505") {
        return NextResponse.json(
          { error: "You are already a member of this organization." },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to join organization." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      organization: { id: organization.id, name: organization.name },
    });
  } catch (error: any) {
    console.error("[organization/invites/[token]/accept] unexpected error", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
