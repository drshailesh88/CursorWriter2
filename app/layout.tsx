import type { Metadata } from "next";
import { Toaster } from "sonner";
import { DevModeIndicator } from "@/components/auth/dev-mode-indicator";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cursor for Academic Writing",
  description: "AI-powered academic writing platform with PubMed research integration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans">
        {children}
        <DevModeIndicator />
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            },
          }}
        />
      </body>
    </html>
  );
}
