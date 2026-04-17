"use client";

import { useEffect, useRef } from "react";

export default function OfflineReconnectBootstrap() {
    const hasDispatchedRef = useRef(false);

    useEffect(() => {
        let disposed = false;

        async function tryDispatchReconnect(source: string) {
            if (disposed) return;
            if (hasDispatchedRef.current) return;
            if (document.visibilityState !== "visible") return;

            try {
                const res = await fetch(`/login?reconnect_probe=${Date.now()}`, {
                    method: "HEAD",
                    cache: "no-store",
                });

                if (!res.ok) return;

                hasDispatchedRef.current = true;

                console.log("🧱 OfflineReconnectBootstrap: reconnect detected", {
                    source,
                });

                window.dispatchEvent(new Event("buildproof-run-reconnect-flow"));
                window.dispatchEvent(new Event("buildproof-data-changed"));
            } catch {
                // still offline or network not ready yet
            }
        }

        function handleOnline() {
            void tryDispatchReconnect("online");
        }

        function handleFocus() {
            void tryDispatchReconnect("focus");
        }

        function handleVisibilityChange() {
            if (document.visibilityState === "visible") {
                void tryDispatchReconnect("visibilitychange");
            }
        }

        window.addEventListener("online", handleOnline);
        window.addEventListener("focus", handleFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        const interval = window.setInterval(() => {
            void tryDispatchReconnect("interval");
        }, 2000);

        return () => {
            disposed = true;
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("focus", handleFocus);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.clearInterval(interval);
        };
    }, []);

    return null;
}