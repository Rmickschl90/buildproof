"use client";

import { useEffect } from "react";

export default function OfflineAppShellBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

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