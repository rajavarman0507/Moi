import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ChatProvider } from "@/context/ChatContext";
import { MusicProvider } from "@/context/MusicContext";
import AppShell from "@/components/AppShell";
import PwaRegister from "@/components/PwaRegister";
import SparklingHearts from "@/components/SparklingHearts";

export const metadata: Metadata = {
  title: "Moi - Private Couple App",
  description: "A private web app for one couple to connect, play games, and journal together.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#12040A",
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
      <body className="antialiased selection:bg-rose-500 selection:text-white relative">
        <AuthProvider>
          <ThemeProvider>
            <ChatProvider>
              <MusicProvider>
                <SparklingHearts />
                <AppShell>
                  {children}
                </AppShell>
              </MusicProvider>
            </ChatProvider>
          </ThemeProvider>
        </AuthProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
