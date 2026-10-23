import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Slip Copilot" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// ตั้งธีมก่อนวาดหน้า (กันจอกะพริบ): ค่าเริ่มต้นสว่าง ดำเมื่อผู้ใช้เลือกไว้
const themeScript = `try{document.documentElement.dataset.theme=localStorage.getItem('slip.theme.v2')==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
