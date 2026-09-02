import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import AppShell from "@/components/AppShell";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Moi - Private Couple App",
  description: "A private web app for one couple to connect, play games, and journal together.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#42232E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-rose-200 selection:text-plum-900">
        <AuthProvider>
          <AppShell>
            {children}
          </AppShell>
        </AuthProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
