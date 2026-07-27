import "./globals.css";
import OfflineSendBootstrap from "@/app/components/OfflineSendBootstrap";
import OfflineAttachmentBootstrap from "@/app/components/OfflineAttachmentBootstrap";
import OfflineSendIndicator from "@/app/components/OfflineSendIndicator";
import OfflineAppShellBootstrap from "@/app/components/OfflineAppShellBootstrap";
import OfflineReconnectBootstrap from "@/app/components/OfflineReconnectBootstrap";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        {/* Applies the stored (or system) theme before first paint, so
            there's no flash of the wrong theme on load -- must run as a raw
            script before any JS bundle, including lib/theme.ts itself. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <OfflineAppShellBootstrap />
        <OfflineAttachmentBootstrap />
        <OfflineReconnectBootstrap />
        <OfflineSendIndicator />
        {children}
        <OfflineSendBootstrap />
      </body>
    </html>
  );
}