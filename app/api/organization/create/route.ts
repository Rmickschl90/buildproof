import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { getUserOrganizationContext } from "@/lib/organizationAuth";

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const body = await req.json();
    const name = String(body?.name ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Missing name." }, { status: 400 });
    }

    const existingContext = await getUserOrganizationContext(user.id);
    if (existingContext) {
      return NextResponse.json(
        { error: "You already belong to an organization." },
        { status: 409 }
      );
    }

    const { data: organization, error: orgError } = await supabaseServer
      .from("organizations")
      .insert({ name, owner_id: user.id })
      .select("id, name")
      .single();

    if (orgError || !organization) {
      console.error("[organization/create] insert organization error", orgError);
      return NextResponse.json(
        { error: "Failed to create organization." },
        { status: 500 }
      );
    }

    const { error: memberError } = await supabaseServer
      .from("organization_members")
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        role: "owner",
      });

    if (memberError) {
      console.error("[organization/create] insert membership error", memberError);

      const { error: cleanupError } = await supabaseServer
        .from("organizations")
        .delete()
        .eq("id", organization.id);

      if (cleanupError) {
        console.error(
          "[organization/create] failed to clean up orphaned organization",
          cleanupError
        );
      }

      return NextResponse.json(
        { error: "Failed to create organization." },
        { status: 500 }
      );
    }

    const { error: reassignError } = await supabaseServer
      .from("projects")
      .update({ organization_id: organization.id })
      .eq("user_id", user.id)
      .is("organization_id", null);

    if (reassignError) {
      console.error("[organization/create] project reassignment error", reassignError);
      return NextResponse.json(
        {
          error:
            "Organization created, but failed to reassign existing projects.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ organization });
  } catch (error) {
    console.error("[organization/create] unexpected error", error);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
