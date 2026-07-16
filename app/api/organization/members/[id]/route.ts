import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  getUserOrganizationContext,
  canUserManageOrganization,
} from "@/lib/organizationAuth";

export async function DELETE(
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

    const canManage = await canUserManageOrganization(
      user.id,
      context.organizationId
    );
    if (!canManage) {
      return NextResponse.json(
        { error: "Only the organization owner can remove members." },
        { status: 403 }
      );
    }

    const { data: member, error: memberError } = await supabaseServer
      .from("organization_members")
      .select("id, organization_id, removed_at")
      .eq("id", id)
      .single();

    if (memberError || !member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    if (member.organization_id !== context.organizationId) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    if (member.removed_at) {
      return NextResponse.json(
        { error: "This member has already been removed." },
        { status: 409 }
      );
    }

    const { data: updated, error: updateError } = await supabaseServer
      .from("organization_members")
      .update({ removed_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, removed_at")
      .single();

    if (updateError) {
      if (updateError.code === "P0001") {
        return NextResponse.json(
          { error: "The organization owner cannot be removed." },
          { status: 409 }
        );
      }

      console.error("[organization/members/[id]] update error", updateError);
      return NextResponse.json(
        { error: "Failed to remove member." },
        { status: 500 }
      );
    }

    return NextResponse.json({ member: updated });
  } catch (error) {
    console.error("[organization/members/[id]] unexpected error", error);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
