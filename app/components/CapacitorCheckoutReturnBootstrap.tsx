"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

// Added 2026-08-06, the return half of the native-app checkout fix (see
// lib/capacitorCheckout.ts for the full explanation of the problem this
// solves). Mounted globally in app/layout.tsx, same pattern as the other
// always-on Offline*Bootstrap components, since checkout/portal can be
// initiated from either /subscribe or /dashboard and this has to be
// listening regardless of which page the user lands back on.
//
// When Stripe/the billing portal finishes (success or cancel) and the
// in-app browser navigates to /checkout-return, that page hands off to
// this app's own custom URL scheme once it detects it's actually running
// on-device (Capacitor.isNativePlatform()). AndroidManifest.xml's
// intent-filter for that scheme routes the OS back into this
// already-running app (MainActivity is singleTask), and Capacitor's App
// plugin surfaces it here as an appUrlOpen event -- this is the
// standard, documented Capacitor pattern for exactly this kind of
// external-redirect return, not something bespoke to this app.
//
// No-ops entirely on web (Capacitor.isNativePlatform() is false there),
// so this can never affect any non-native user.
export default function CapacitorCheckoutReturnBootstrap() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | undefined;
    let cancelled = false;

    App.addListener("appUrlOpen", async (data: URLOpenListenerEvent) => {
      try {
        const url = new URL(data.url);
        if (url.host !== "checkout-return") return;

        const dest = url.searchParams.get("dest") || "/dashboard";
        url.searchParams.delete("dest");
        const qs = url.searchParams.toString();

        await Browser.close().catch(() => {
          // Already closed, or never actually opened via Browser.open --
          // either way there's nothing left to close, not a real failure.
        });

        router.replace(`${dest}${qs ? `?${qs}` : ""}`);
      } catch (e) {
        console.error("Checkout return handling failed", e);
      }
    }).then((handle: PluginListenerHandle) => {
      if (cancelled) {
        handle.remove();
      } else {
        removeListener = () => handle.remove();
      }
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [router]);

  return null;
}
