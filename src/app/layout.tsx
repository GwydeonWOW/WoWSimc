import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WoWSimc - WoW Character Analyzer",
  description: "Analiza tu personaje de World of Warcraft y comparalo con los mejores jugadores. Stats, gear, talentos y mas.",
  keywords: ["WoW", "World of Warcraft", "SimulationCraft", "character analysis", "Mythic+", "Raid"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--background)", color: "var(--foreground)" }}>
        <Script src="https://wow.zamimg.com/js/tooltips.js" strategy="afterInteractive" />
        <header style={{ borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
          <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
              <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--primary)" }}>WoW</span>
              <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--foreground)" }}>Simc</span>
            </a>
            <nav style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
              <a href="/compare" style={{ fontSize: "0.875rem", color: "var(--muted)", textDecoration: "none" }}>
                Comparar
              </a>
              <a href="/" style={{ fontSize: "0.875rem", color: "var(--muted)", textDecoration: "none" }}>
                Guias
              </a>
            </nav>
          </div>
        </header>
        <main style={{ flex: 1 }}>
          {children}
        </main>
        <footer style={{ borderTop: "1px solid var(--border)", background: "var(--card)", padding: "1rem 0", textAlign: "center", fontSize: "0.75rem", color: "var(--muted)" }}>
          WoWSimc - Character Analyzer. Datos de Blizzard Entertainment y Raider.IO.
        </footer>
      </body>
    </html>
  );
}
