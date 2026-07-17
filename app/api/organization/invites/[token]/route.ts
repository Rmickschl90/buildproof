import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { hashInviteToken } from "@/lib/organizationInvites/hashInviteToken";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params;

    if (!token) {
      return NextResponse.json({ error: "Missing token." }, { status: 400 });
    }

    const tokenHash = hashInviteToken(token);

    const { data: invite, error: inviteError } = await supabaseServer
      .from("organization_invites")
      .select("organization_id, email, role, expires_at, accepted_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (inviteError) {
      console.error("[organization/invites/[token]] lookup error", inviteError);
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

    const { data: organization, error: orgError } = await supabaseServer
      .from("organizations")
      .select("name")
      .eq("id", invite.organization_id)
      .single();

    if (orgError || !organization) {
      console.error("[organization/invites/[token]] organization fetch error", orgError);
      return NextResponse.json(
        { error: "Failed to load organization." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      organizationName: organization.name,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expires_at,
    });
  } catch (error: any) {
    console.error("[organization/invites/[token]] unexpected error", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
