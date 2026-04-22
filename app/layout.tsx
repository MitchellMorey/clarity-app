import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { ToastHost } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Clarity — Document Accessibility Review",
  description:
    "Upload Word, PowerPoint, and PDF documents and get an accessibility report in seconds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          {children}
          <ToastHost />
        </AppProvider>
      </body>
    </html>
  );
}
