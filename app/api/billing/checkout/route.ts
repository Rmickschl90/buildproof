import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePriceId = process.env.STRIPE_PRICE_ID;

export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    if (!stripeSecretKey || !stripePriceId) {
      return NextResponse.json(
        { error: "Stripe checkout is not configured" },
        { status: 500 }
      );
    }

    const origin = req.nextUrl.origin;

    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("payment_method_types[0]", "card");
    params.append("line_items[0][price]", stripePriceId);
    params.append("line_items[0][quantity]", "1");
    params.append("client_reference_id", user.id);
    params.append("metadata[user_id]", user.id);
    params.append("subscription_data[metadata][user_id]", user.id);
    params.append("success_url", `${origin}/dashboard?billing=success`);
    params.append("cancel_url", `${origin}/dashboard?billing=cancelled`);

    if (user.email) {
      params.append("customer_email", user.email);
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
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
          error: "Stripe checkout failed",
          status: stripeRes.status,
          bodyPreview: text.slice(0, 500),
        },
        { status: 500 }
      );
    }

    const session = JSON.parse(text);

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("Billing checkout failed", e);

    return NextResponse.json(
      {
        error: e?.message ?? "Checkout failed",
        name: e?.name ?? null,
      },
      { status: 500 }
    );
  }
}
