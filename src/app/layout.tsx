import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/components/ui/Toast";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { Analytics } from "@vercel/analytics/next";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "SMA 15 Makassar LMS - Learning Management System",
  description: "Sistem Manajemen Pembelajaran SMA 15 Makassar dengan fitur Absensi QR, Ujian CBT, dan Monitoring",
  icons: {
    icon: "/logo_sma15.png",
    apple: "/logo_sma15.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${jakarta.variable} font-sans antialiased bg-background text-foreground transition-colors`}>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <OfflineBanner />
              {children}
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`
          }}
        />
      </body>
    </html>
  );
}
