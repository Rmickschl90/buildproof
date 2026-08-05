import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";
import {
  getUserOrganizationContext,
  canUserManageOrganization,
} from "@/lib/organizationAuth";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Stripe portal is not configured" },
        { status: 500 }
      );
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
        { error: "Only the organization owner can manage billing." },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseServer
      .from("organization_subscriptions")
      .select("stripe_customer_id")
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Unable to load billing customer" },
        { status: 500 }
      );
    }

    if (!data?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No Stripe customer found" },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

    const params = new URLSearchParams();
    params.append("customer", data.stripe_customer_id);
    // 2026-08-06: routed through /checkout-return -- see
    // lib/capacitorCheckout.ts and app/api/billing/checkout/route.ts's
    // matching comment for the full explanation. Not yet wired to a
    // dashboard button (see that file's own client), but fixed anyway so
    // it's already correct whenever it is.
    params.append("return_url", `${appUrl}/checkout-return?dest=%2Fdashboard`);

    const stripeRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const text = await stripeRes.text();

    if (!stripeRes.ok) {
      return NextResponse.json(
        {
          error: "Stripe portal failed",
          status: stripeRes.status,
          bodyPreview: text.slice(0, 500),
        },
        { status: 500 }
      );
    }

    const session = JSON.parse(text);

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("Billing team portal failed", e);

    return NextResponse.json(
      {
        error: e?.message ?? "Billing team portal failed",
        name: e?.name ?? null,
      },
      { status: 500 }
    );
  }
}
