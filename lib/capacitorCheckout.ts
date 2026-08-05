import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

// Added 2026-08-06: found live in production -- every Stripe checkout/portal
// entry point in this app (individual signup, team signup, existing-owner
// team upgrade, both billing portal buttons) used a plain
// `window.location.href = url` redirect. That works fine on the web, but
// inside the native Android app it breaks: Capacitor's WebView only
// navigates in-place within this app's own configured origin
// (capacitor.config.ts's server.url) -- any other domain, including
// checkout.stripe.com and billing.stripe.com, gets handed off to the
// system browser as a completely separate app/task. Stripe's
// success_url/cancel_url/return_url then just load as an ordinary webpage
// in that system browser, with no way to signal the native app that
// checkout finished -- so the app itself was left frozen on whatever
// screen it was on when it lost control (this is exactly what Ryan hit on
// a real device testing Team signup).
//
// On native, this opens the Stripe URL in an in-app browser (Chrome Custom
// Tabs on Android) instead, which stays part of the same app task rather
// than switching to a separate one. See CapacitorCheckoutReturnBootstrap.tsx
// for how the app actually gets notified when checkout/portal finishes and
// closes that in-app browser again -- Stripe can only redirect to real
// https URLs, so every success_url/cancel_url/return_url this app passes to
// Stripe now points at /checkout-return, a small bridge page that performs
// the actual hand-back to the native app once it's running on-device.
//
// On web this is unchanged: Capacitor.isNativePlatform() is false, so this
// is a plain window.location.href redirect exactly like before.
export async function openCheckoutUrl(url: string) {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
  } else {
    window.location.href = url;
  }
}
