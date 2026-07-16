import { supabaseServer } from "@/lib/supabaseServer";

export type UserOrganizationContext = {
  organizationId: string;
  role: "owner" | "member";
};

export async function getUserOrganizationContext(
  userId: string
): Promise<UserOrganizationContext | null> {
  const { data, error } = await supabaseServer
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .is("removed_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return { organizationId: data.organization_id, role: data.role };
}

export async function canUserAccessProject(
  userId: string,
  projectId: string
): Promise<boolean> {
  const { data: project, error } = await supabaseServer
    .from("projects")
    .select("user_id, organization_id")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    return false;
  }

  if (project.user_id === userId) {
    return true;
  }

  if (!project.organization_id) {
    return false;
  }

  const context = await getUserOrganizationContext(userId);
  return context?.organizationId === project.organization_id;
}

export async function canUserManageOrganization(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const context = await getUserOrganizationContext(userId);
  return context?.organizationId === organizationId && context.role === "owner";
}
