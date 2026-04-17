"use client";

import { useEffect } from "react";

export default function OfflineReconnectBootstrap() {
  useEffect(() => {
    function handleOnline() {
      console.log("🧱 OfflineReconnectBootstrap: online event fired");
      window.dispatchEvent(new Event("buildproof-data-changed"));
    }

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return null;
}