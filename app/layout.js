export const metadata = { title: "Wachtrooster", description: "Planner" };

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <head>
        {/* Tailwind via CDN (geen build stap nodig) */}
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
