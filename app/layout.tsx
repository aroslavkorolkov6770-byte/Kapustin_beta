import type { Metadata, Viewport } from "next";
import "./globals.css";
import CookieBanner from "./components/CookieBanner";
import Footer from "./components/Footer";
import ThemeProvider from "./components/ThemeProvider";

export const metadata: Metadata = {
  title: "Ватэс",
  description: "Обучение и знания команды",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "Ватэс",
  },
  icons: {
    icon: [
      { url: "/vates-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/vates-icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/vates-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning style={{ overscrollBehavior: 'none' }}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var savedTheme = window.localStorage.getItem('vates_theme_v1');
                  var theme = savedTheme === 'dark' ? 'dark' : 'light';
                  document.documentElement.dataset.theme = theme;
                  document.documentElement.style.colorScheme = theme;
                } catch (error) {
                  document.documentElement.dataset.theme = 'light';
                  document.documentElement.style.colorScheme = 'light';
                }
              })();
            `,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" sizes="180x180" href="/vates-icon-180.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
      </head>
      {/* ФИКС: Запрещаем горизонтальную прокрутку на уровне всего приложения */}
      <body style={{ overscrollBehavior: 'none', overflowX: 'hidden', margin: 0, padding: 0 }}>
        <ThemeProvider>
          {children}
          <Footer />
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
