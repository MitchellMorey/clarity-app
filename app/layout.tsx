import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { ToastHost } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Clarity — Document Accessibility Review",
  description:
    "Upload a Word document or PowerPoint deck and get an accessibility report in seconds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/*
          Carlito is a free font with the same metrics as Microsoft Calibri.
          It's used by the DocPreview component so the "as it appears in your
          document" previews render faithfully even on machines that don't
          have Calibri installed.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppProvider>
          {children}
          <ToastHost />
        </AppProvider>
      </body>
    </html>
  );
}
