"use client";

import { useMemo, useState } from "react";

type Mode = "email" | "sms";

export function SendToClientDialog({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const [mode, setMode] = useState<Mode>("email");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string>("");

  const defaultMessage = useMemo(() => {
    if (mode === "sms") return `BuildProof update: ${projectTitle}\n{link}`;
    return `Quick update for "${projectTitle}".\n\nView the journal here: {link}\n\n— Sent from BuildProof`;
  }, [mode, projectTitle]);

  async function send() {
    setStatus("sending");
    setError("");

    try {
      const payload =
        mode === "email"
          ? { projectId, toEmail: to.trim(), message: message.trim() || undefined }
          : { projectId, toPhone: to.trim(), message: message.trim() || undefined };

      const res = await fetch(`/api/send/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to send.");

      // Nice UX: show sent + let them copy the link as well.
      setStatus("sent");

      // If user wrote a template with {link}, you could optionally update UI with returned shareUrl.
      // (Server already sends the final message, so this is just for display.)
    } catch (e: any) {
      setStatus("error");
      setError(e?.message ?? "Failed to send.");
    }
  }

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Send update</div>
        <div className="flex gap-2">
          <button
            className={`px-3 py-1 rounded-xl border ${mode === "email" ? "bg-black text-white" : ""}`}
            onClick={() => setMode("email")}
          >
            Email
          </button>
          <button
            className={`px-3 py-1 rounded-xl border ${mode === "sms" ? "bg-black text-white" : ""}`}
            onClick={() => setMode("sms")}
          >
            Text
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-sm opacity-80">{mode === "email" ? "Client email" : "Client phone (E.164)"}</div>
        <input
          className="w-full border rounded-xl px-3 py-2"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={mode === "email" ? "client@email.com" : "+15551234567"}
        />
      </div>

      <div className="space-y-1">
        <div className="text-sm opacity-80">Message (optional)</div>
        <textarea
          className="w-full border rounded-xl px-3 py-2 min-h-[110px]"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={defaultMessage}
        />
        <div className="text-xs opacity-70">
          Tip: keep it friendly. The journal link includes photos/files + PDF export.
        </div>
      </div>

      {status === "error" && <div className="text-sm text-red-600">{error}</div>}
      {status === "sent" && <div className="text-sm text-green-700">Sent.</div>}

      <button
        className="w-full rounded-2xl bg-black text-white py-2 disabled:opacity-50"
        disabled={status === "sending" || !to.trim()}
        onClick={send}
      >
        {status === "sending" ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
