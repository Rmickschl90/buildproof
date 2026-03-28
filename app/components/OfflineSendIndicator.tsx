"use client";

import { useEffect, useState } from "react";
import { getFlushableOfflineSendRecords } from "@/lib/offlineSendOutbox";

export default function OfflineSendIndicator() {
  const [queuedCount, setQueuedCount] = useState(0);

  async function refreshQueuedCount() {
  try {
    const records = await getFlushableOfflineSendRecords();

    const trulyQueued = records.filter((record: any) => {
      const status = String(record?.status || "").toLowerCase();
      return status === "pending" || status === "syncing";
    });

    setQueuedCount(trulyQueued.length);
  } catch {
    setQueuedCount(0);
  }
}

  useEffect(() => {
    function handleFocus() {
      refreshQueuedCount();
    }

    function handleOnline() {
      refreshQueuedCount();
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        refreshQueuedCount();
      }
    }

    function handleSendComplete() {
      refreshQueuedCount();
    }

    const interval = window.setInterval(() => {
      refreshQueuedCount();
    }, 3000);

    refreshQueuedCount();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("buildproof-send-complete", handleSendComplete as EventListener);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("buildproof-send-complete", handleSendComplete as EventListener);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  if (queuedCount <= 0) return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        width: "100%",
        padding: "10px 14px",
        background: "#fef3c7",
        borderBottom: "1px solid #f59e0b",
        color: "#92400e",
        fontWeight: 700,
        fontSize: 14,
        textAlign: "center",
      }}
    >
      ⚡ {queuedCount} update{queuedCount === 1 ? "" : "s"} waiting to send
    </div>
  );
}