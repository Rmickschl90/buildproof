"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { flushOfflineAttachmentOutbox } from "@/lib/offlineAttachmentFlush";
import { flushOfflineApprovalAttachmentOutbox } from "@/lib/offlineApprovalAttachmentFlush";

export default function OfflineAttachmentBootstrap() {
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
        await flushOfflineAttachmentOutbox(getAccessToken);
        await flushOfflineApprovalAttachmentOutbox(getAccessToken);
      } catch (error) {
        console.error("[OfflineAttachmentBootstrap] flush failed", error);
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