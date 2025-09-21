// app/layout.js
import Script from "next/script";

export const metadata = { title: "Wachtrooster", description: "Planner" };

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <head>
        {/* Tailwind via CDN */}
        <Script
          id="tailwind-cdn"
          src="https://cdn.tailwindcss.com"
          strategy="beforeInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
