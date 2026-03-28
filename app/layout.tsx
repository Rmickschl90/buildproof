import "./globals.css";
import OfflineSendBootstrap from "@/app/components/OfflineSendBootstrap";
import OfflineAttachmentBootstrap from "@/app/components/OfflineAttachmentBootstrap";
import OfflineSendIndicator from "@/app/components/OfflineSendIndicator";

export const metadata = {
  title: "BuildProof",
  description: "Project proof capture for remodeling & construction",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>
      <body>
        <OfflineSendBootstrap />
        <OfflineAttachmentBootstrap />
        <OfflineSendIndicator />
        {children}
      </body>
    </html>
  );
}