import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const secret = process.env.STRIPE_SECRET_KEY || "";
  const price = process.env.STRIPE_PRICE_ID || "";
  const webhook = process.env.STRIPE_WEBHOOK_SECRET || "";

  return NextResponse.json({
    hasSecretKey: Boolean(secret),
    secretPrefix: secret.slice(0, 8),
    secretLength: secret.length,
    hasPriceId: Boolean(price),
    pricePrefix: price.slice(0, 8),
    priceLength: price.length,
    hasWebhookSecret: Boolean(webhook),
    webhookPrefix: webhook.slice(0, 6),
    webhookLength: webhook.length,
  });
}
