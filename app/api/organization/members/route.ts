import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { getUserOrganizationContext } from "@/lib/organizationAuth";

export async function GET(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const context = await getUserOrganizationContext(user.id);
    if (!context) {
      return NextResponse.json(
        { error: "You do not belong to an organization." },
        { status: 404 }
      );
    }

    const { data: memberRows, error: membersError } = await supabaseServer
      .from("organization_members")
      .select("id, user_id, role, joined_at")
      .eq("organization_id", context.organizationId)
      .is("removed_at", null);

    if (membersError || !memberRows) {
      console.error("[organization/members] query error", membersError);
      return NextResponse.json(
        { error: "Failed to load organization members." },
        { status: 500 }
      );
    }

    const members = await Promise.all(
      memberRows.map(async (row) => {
        const { data: userData, error: userError } =
          await supabaseServer.auth.admin.getUserById(row.user_id);

        if (userError) {
          console.error(
            "[organization/members] failed to look up user",
            row.user_id,
            userError
          );
        }

        return {
          id: row.id,
          user_id: row.user_id,
          role: row.role,
          joined_at: row.joined_at,
          email: userData?.user?.email ?? null,
        };
      })
    );

    // Pending invites: not yet accepted, not revoked, not expired. Mirrors the
    // exact capacity-check filter already used in POST /api/organization/invite,
    // so what's "pending" here always matches what counts against member_limit.
    const nowIso = new Date().toISOString();

    const { data: inviteRows, error: invitesError } = await supabaseServer
      .from("organization_invites")
      .select("id, email, expires_at")
      .eq("organization_id", context.organizationId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", nowIso);

    if (invitesError) {
      console.error("[organization/members] invites query error", invitesError);
      return NextResponse.json(
        { error: "Failed to load pending invites." },
        { status: 500 }
      );
    }

    return NextResponse.json({ members, invites: inviteRows ?? [] });
  } catch (error) {
    console.error("[organization/members] unexpected error", error);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
