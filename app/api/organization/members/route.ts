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
      .select("user_id, role, joined_at")
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
          user_id: row.user_id,
          role: row.role,
          joined_at: row.joined_at,
          email: userData?.user?.email ?? null,
        };
      })
    );

    return NextResponse.json({ members });
  } catch (error) {
    console.error("[organization/members] unexpected error", error);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
