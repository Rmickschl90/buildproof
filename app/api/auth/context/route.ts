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
      return NextResponse.json({ organizationId: null });
    }

    const { data: organization, error: orgError } = await supabaseServer
      .from("organizations")
      .select("name")
      .eq("id", context.organizationId)
      .single();

    if (orgError || !organization) {
      console.error("[auth/context] organization fetch error", orgError);
      return NextResponse.json(
        { error: "Failed to load organization." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      organizationId: context.organizationId,
      organizationName: organization.name,
      role: context.role,
    });
  } catch (error: any) {
    console.error("[auth/context] unexpected error", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
