import type { Viewport } from "next";
import "./globals.css";
import OfflineSendBootstrap from "@/app/components/OfflineSendBootstrap";
import OfflineAttachmentBootstrap from "@/app/components/OfflineAttachmentBootstrap";
import OfflineSendIndicator from "@/app/components/OfflineSendIndicator";
import OfflineAppShellBootstrap from "@/app/components/OfflineAppShellBootstrap";
import OfflineReconnectBootstrap from "@/app/components/OfflineReconnectBootstrap";
import CapacitorCheckoutReturnBootstrap from "@/app/components/CapacitorCheckoutReturnBootstrap";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

export const metadata = {
  title: "Leeward",
  description:
    "Project communication, documentation, approvals, and updates with accountability built in.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

// Next.js App Router has a dedicated viewport export specifically so it
// doesn't also inject its own default <meta name="viewport"> tag (which
// would lack viewportFit: "cover" and silently zero out every
// env(safe-area-inset-*) value in CSS, regardless of what globals.css says).
// A hand-written <meta> tag in <head> risked exactly that duplicate-tag
// conflict -- this is the officially supported way to set it once.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored (or system) theme before first paint, so
            there's no flash of the wrong theme on load -- must run as a raw
            script before any JS bundle, including lib/theme.ts itself. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <OfflineAppShellBootstrap />
        <OfflineAttachmentBootstrap />
        <OfflineReconnectBootstrap />
        <CapacitorCheckoutReturnBootstrap />
        <OfflineSendIndicator />
        {children}
        <OfflineSendBootstrap />
      </body>
    </html>
  );
}