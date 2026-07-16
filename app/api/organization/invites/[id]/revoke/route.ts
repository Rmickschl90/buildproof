import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  getUserOrganizationContext,
  canUserManageOrganization,
} from "@/lib/organizationAuth";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const { id } = await ctx.params;

    if (!id) {
      return NextResponse.json({ error: "Missing id." }, { status: 400 });
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
        { error: "Only the organization owner can revoke invites." },
        { status: 403 }
      );
    }

    const { data: invite, error: inviteError } = await supabaseServer
      .from("organization_invites")
      .select("id, organization_id, accepted_at, revoked_at")
      .eq("id", id)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: "Invite not found." }, { status: 404 });
    }

    if (invite.organization_id !== context.organizationId) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    if (invite.accepted_at) {
      return NextResponse.json(
        { error: "This invite has already been accepted." },
        { status: 409 }
      );
    }

    if (invite.revoked_at) {
      return NextResponse.json(
        { error: "This invite has already been revoked." },
        { status: 409 }
      );
    }

    const { data: updated, error: updateError } = await supabaseServer
      .from("organization_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, revoked_at")
      .single();

    if (updateError) {
      console.error("[organization/invites/[id]/revoke] update error", updateError);
      return NextResponse.json(
        { error: "Failed to revoke invite." },
        { status: 500 }
      );
    }

    return NextResponse.json({ invite: updated });
  } catch (error: any) {
    console.error("[organization/invites/[id]/revoke] unexpected error", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
