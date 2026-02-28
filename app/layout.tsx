import type { Metadata } from "next"

import "./globals.css"
import { ActiveThemeProvider } from "@/components/active-theme"
import { ThemeProvider } from "@/components/theme-provider"

export const metadata: Metadata = {
  title: "KubeSpark Dashboard Scaffold",
  description: "Dashboard scaffold based on shadcn/ui new-york-v4 dashboard-01",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <ActiveThemeProvider initialTheme="default">
            {children}
          </ActiveThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
