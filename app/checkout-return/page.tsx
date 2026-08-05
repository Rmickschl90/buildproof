"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Capacitor } from "@capacitor/core";

// Added 2026-08-06, part of the native-app checkout fix (see
// lib/capacitorCheckout.ts for the full explanation). Stripe's
// success_url/cancel_url/return_url can only be real https URLs -- it
// rejects custom URL schemes -- so every checkout/portal route in this app
// now points here instead of straight at /dashboard or /subscribe, with a
// `dest` param carrying the real intended destination.
//
// On web, this just forwards straight to that destination -- functionally
// identical to what every one of these redirects did before this fix.
//
// On native, Stripe/the portal is running inside the in-app browser
// (see lib/capacitorCheckout.ts), so this page is what's actually loaded
// on-device at that point -- Capacitor.isNativePlatform() is true here,
// unlike in a plain system browser. It hands off to this app's own custom
// URL scheme, matching the AndroidManifest.xml intent-filter added
// alongside this, which the OS routes back into the already-running
// native app (MainActivity is singleTask, so no duplicate instance is
// created). CapacitorCheckoutReturnBootstrap.tsx picks that up as an
// appUrlOpen event, closes the in-app browser, and finishes the
// navigation to the real destination.
//
// Uses the real Android applicationId (android/app/build.gradle), not
// capacitor.config.ts's appId field -- those two have quietly disagreed
// ("com.linquelabs.leeward" vs "com.linquelabs.leewardapp") since before
// this fix, and the build.gradle value is what's actually compiled into
// the app, so it's the one that has to match AndroidManifest.xml's
// intent-filter for this to work.
const APP_URL_SCHEME = "com.linquelabs.leeward";

function CheckoutReturnInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const dest = params.get("dest") || "/dashboard";
    params.delete("dest");

    if (Capacitor.isNativePlatform()) {
      params.set("dest", dest);
      window.location.href = `${APP_URL_SCHEME}://checkout-return?${params.toString()}`;
    } else {
      const qs = params.toString();
      window.location.href = `${dest}${qs ? `?${qs}` : ""}`;
    }
  }, [searchParams]);

  return (
    <div className="container">
      <div className="shell">
        <div className="card">
          <h1 className="h1">Finishing up...</h1>
          <p className="sub">Returning you to Leeward.</p>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="container">
          <div className="shell">
            <div className="card">
              <h1 className="h1">Finishing up...</h1>
              <p className="sub">Returning you to Leeward.</p>
            </div>
          </div>
        </div>
      }
    >
      <CheckoutReturnInner />
    </Suspense>
  );
}
