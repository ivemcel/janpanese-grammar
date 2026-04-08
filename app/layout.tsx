import type { Metadata } from "next";
import "../styles.css";

export const metadata: Metadata = {
  title: "N2 语法备考",
  description: "围绕 JLPT N2 语法教材的速查、复习与学习进度追踪。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
