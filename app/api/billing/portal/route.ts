import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

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

    const { data, error } = await supabaseServer
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
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
    params.append("return_url", `${appUrl}/dashboard`);

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
    console.error("Billing portal failed", e);

    return NextResponse.json(
      {
        error: e?.message ?? "Billing portal failed",
        name: e?.name ?? null,
      },
      { status: 500 }
    );
  }
}

