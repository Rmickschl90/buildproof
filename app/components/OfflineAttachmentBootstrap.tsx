"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { flushOfflineAttachmentOutbox } from "@/lib/offlineAttachmentFlush";
import { flushOfflineApprovalAttachmentOutbox } from "@/lib/offlineApprovalAttachmentFlush";

export default function OfflineAttachmentBootstrap() {
  const isFlushingRef = useRef(false);

  useEffect(() => {
    async function getAccessToken() {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const token = data.session?.access_token;
      if (!token) throw new Error("Not logged in");

      return token;
    }

    async function runFlush() {
      if (isFlushingRef.current) return;

      isFlushingRef.current = true;

      try {
        await flushOfflineAttachmentOutbox(getAccessToken);
        await flushOfflineApprovalAttachmentOutbox(getAccessToken);
      } catch (error) {
        console.error("[OfflineAttachmentBootstrap] flush failed", error);
      } finally {
        isFlushingRef.current = false;
      }
    }

    function handleOnline() {
      void runFlush();
    }

    function handleFocus() {
      void runFlush();
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void runFlush();
      }
    }

    void runFlush();

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