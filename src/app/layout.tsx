import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b border-border bg-card">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold text-primary">WoW</span>
              <span className="text-xl font-bold text-foreground">Simc</span>
            </a>
            <nav className="flex items-center gap-6">
              <a href="/compare" className="text-sm text-muted hover:text-foreground transition-colors">
                Comparar
              </a>
              <a href="/" className="text-sm text-muted hover:text-foreground transition-colors">
                Guias
              </a>
            </nav>
          </div>
        </header>
        <main className="flex-1">
          {children}
        </main>
        <footer className="border-t border-border bg-card py-4 text-center text-xs text-muted">
          WoWSimc - Character Analyzer. Datos de Blizzard Entertainment y Raider.IO.
        </footer>
      </body>
    </html>
  );
}
