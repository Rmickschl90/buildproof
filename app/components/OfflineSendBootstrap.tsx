"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { flushOfflineSendOutbox } from "@/lib/offlineSendFlush";

export default function OfflineSendBootstrap() {
  useEffect(() => {
    async function getAccessToken() {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const token = data.session?.access_token;
      if (!token) throw new Error("Not logged in");

      return token;
    }

    async function runFlush() {
      try {
        await flushOfflineSendOutbox({
          getAccessToken,
        });
      } catch (error) {
        console.error("[OfflineSendBootstrap] flush failed", error);
      }
    }

    function handleOnline() {
      runFlush();
    }

    function handleFocus() {
      runFlush();
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        runFlush();
      }
    }

    runFlush();

    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return null;
}