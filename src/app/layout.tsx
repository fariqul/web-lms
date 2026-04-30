import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/components/ui/Toast";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { SessionEventHandler } from "@/components/auth/SessionEventHandler";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "SMA Negeri 15 Makassar — Unggul dalam Prestasi, Santun dalam Budi Pekerti",
  description: "Website resmi SMA Negeri 15 Makassar. Sekolah unggulan dengan program Kurikulum Merdeka, STEM, dan 20+ ekstrakurikuler. Pendaftaran PPDB, LMS, dan informasi akademik.",
  keywords: ["SMA Negeri 15 Makassar", "SMAN 15 Makassar", "sekolah menengah atas makassar", "PPDB Makassar", "LMS SMA 15"],
  openGraph: {
    title: "SMA Negeri 15 Makassar",
    description: "Unggul dalam Prestasi, Santun dalam Budi Pekerti — Sekolah unggulan di Makassar dengan fasilitas modern dan program pendidikan berkualitas.",
    type: "website",
    locale: "id_ID",
    images: [{ url: "/landing/logo.png", width: 512, height: 512, alt: "Logo SMA Negeri 15 Makassar" }],
  },
  icons: {
    icon: "/logo_sma15.png",
    shortcut: "/logo_sma15.png",
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
      <head>
        <meta name="color-scheme" content="light dark" />
        {/* Landing page fonts (Crimson Pro + DM Sans) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@300;400;600;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning className={`${jakarta.variable} font-sans antialiased bg-background text-foreground transition-colors duration-200`}>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <SessionEventHandler />
              <OfflineBanner />
              {children}
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
        <script
          data-goatcounter="https://ilham.goatcounter.com/count"
          async
          src="//gc.zgo.at/count.js"
        ></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`
          }}
        />
      </body>
    </html>
  );
}
