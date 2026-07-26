"use client";

import { useEffect } from "react";

export default function OfflineAppShellBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Skip registration entirely on localhost -- this SW exists for the
    // production PWA / native app-shell offline experience, not local dev.
    // Its static-asset handler is cache-first (see public/sw.js), so once a
    // JS chunk is cached it's served forever regardless of what the dev
    // server recompiles -- that silently breaks Fast Refresh and was the
    // cause of several "my edit isn't showing up" false alarms this
    // session, each only fixed by a full DevTools "Clear site data" (which
    // also wipes the logged-in session). Staging/production/native never
    // load this hostname, so this is a no-op for them.
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (isLocalhost) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");

        await registration.update();
        await navigator.serviceWorker.ready;

        if (!navigator.serviceWorker.controller) {
          const reloadKey = "buildproof-sw-control-reload";

          if (!sessionStorage.getItem(reloadKey)) {
            sessionStorage.setItem(reloadKey, "1");
            window.location.reload();
          }
        } else {
          sessionStorage.removeItem("buildproof-sw-control-reload");
        }
      } catch (error) {
        console.error("Service worker registration failed", error);
      }
    };

    void register();
  }, []);

  return null;
}