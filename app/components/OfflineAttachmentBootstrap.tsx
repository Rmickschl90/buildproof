"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { flushOfflineApprovalAttachmentOutbox } from "@/lib/offlineApprovalAttachmentFlush";
import { flushOfflineApprovalSendOutbox } from "@/lib/offlineApprovalSendFlush";
import { flushOfflineApprovalOutbox } from "@/lib/offlineApprovalFlush";

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
        await flushOfflineApprovalOutbox(getAccessToken);
        await flushOfflineApprovalAttachmentOutbox(getAccessToken);
        await flushOfflineApprovalSendOutbox(getAccessToken);
      } catch (error) {
        console.error("[OfflineAttachmentBootstrap] flush failed", error);
      } finally {
        isFlushingRef.current = false;
      }
    }

    function handleOnline() {
  void runFlush();

  const fn = (window as any).__runDashboardReconnect;
  if (typeof fn === "function") {
    void fn();
  }
}

    function handleFocus() {
  void runFlush();

  const fn = (window as any).__runDashboardReconnect;
  if (typeof fn === "function") {
    void fn();
  }
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