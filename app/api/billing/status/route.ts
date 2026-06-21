import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const { data, error } = await supabaseServer
      .from("user_subscriptions")
      .select(
        "status,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Unable to load billing status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: data?.status || "inactive",
      currentPeriodEnd: data?.current_period_end || null,
      cancelAtPeriodEnd: data?.cancel_at_period_end || false,
      hasStripeCustomer: Boolean(data?.stripe_customer_id),
      hasStripeSubscription: Boolean(data?.stripe_subscription_id),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Billing status failed" },
      { status: 500 }
    );
  }
}
