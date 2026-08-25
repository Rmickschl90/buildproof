import { Capacitor } from "@capacitor/core";

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
//
// CHANGED 2026-08-24: reverted the native branch away from
// Browser.open() (an in-app SFSafariViewController on iOS / Chrome Custom
// Tab on Android) back to a plain top-level window.location.href
// navigation, identical to the web branch. Reason: Apple's App Review
// rejected this app under Guideline 3.1.1 a second time, and this
// rejection's specific wording ("Apps on the United States storefront may
// link out to the default browser...") is meaningfully different from an
// in-app browser sheet -- SFSafariViewController/Custom Tabs are
// sandboxed and external in a security sense, but never actually leave
// the app or switch to the real Safari/Chrome app the way Apple's
// guideline describes. A plain window.location.href to a domain outside
// capacitor.config.ts's server.url (checkout.stripe.com,
// billing.stripe.com) is NOT specially intercepted by this app -- with no
// `server.allowNavigation` entries configured, Capacitor's default
// WebView navigation policy hands any such navigation off to the real
// system default browser as a separate app/task. This is the exact same
// default behavior that caused the original "Native Checkout Stranding"
// bug this file's own history describes above -- the difference this
// time is that /checkout-return's custom-URL-scheme bridge (built as
// part of that same original fix, see app/checkout-return/page.tsx and
// CapacitorCheckoutReturnBootstrap.tsx) does not care which browser
// context loaded it. It performs a plain custom-scheme redirect
// (`window.location.href = "com.linquelabs.leeward://..."`), which iOS/
// Android intercept and route back into this already-running app
// (MainActivity is singleTask) regardless of whether the page that
// triggered it was inside Safari itself or an SFSafariViewController --
// so switching back to a true external handoff should not reintroduce
// the original stranding bug, since the return path was never actually
// dependent on using an in-app browser. Still needs real-device
// TestFlight/Play Store verification before this can be trusted, exactly
// like the original fix was.
export async function openCheckoutUrl(url: string) {
  window.location.href = url;
}

// Added 2026-08-06, fixing a real bug found on a real device: the checkout
// API routes need to know, at the moment they build success_url/cancel_url/
// return_url, whether this request came from the native app -- but they
// can't ask app/checkout-return/page.tsx to answer that with
// Capacitor.isNativePlatform() once it's actually running, because that
// page loads inside the in-app browser Stripe/the portal is shown in
// (@capacitor/browser's Chrome Custom Tabs on Android), and Custom Tabs
// don't have Capacitor's JS bridge injected into them -- only the app's own
// screens do. Capacitor.isNativePlatform() there silently and always comes
// back false, which meant /checkout-return took its "web" branch for real
// on-device: it just navigated to the final destination inside that same
// Custom Tab instead of handing back to the native app, leaving the app
// itself exactly as stuck as before this whole fix.
//
// The one place that DOES reliably know whether this is native is right
// here, in the app's own already-running WebView, at the moment checkout
// is being initiated -- so that's where the signal has to originate.
// Every checkout-initiating fetch call appends this to the request URL;
// every billing API route reads it and bakes a matching `&native=1` into
// the success_url/cancel_url/return_url it hands to Stripe, so
// /checkout-return can make the right call from a plain, reliable URL
// param instead of re-detecting platform somewhere it structurally can't.
export function withNativeFlag(path: string): string {
  if (!Capacitor.isNativePlatform()) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}platform=native`;
}
