// Provides the Next.js document around the AdminCN default layout source.
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/public-sans';
import '@fontsource-variable/jetbrains-mono';
import { ThemeProvider } from '../shared/ui/theme-provider';
import './styles/index.css';

export const metadata: Metadata = {
  title: 'SoftJL',
  description: '面向毕设与课程设计的工程实践工作台，关联需求、模型、测试与说明书，提供检查与修改依据',
  robots: { index: false, follow: false },
  icons: {
    // Keep a raster icon available for search crawlers alongside the theme-aware SVG.
    icon: [
      { url: '/brand/uml-platform-logo.png', type: 'image/png', sizes: '192x192' },
      { url: '/brand/uml-platform-logo.svg', type: 'image/svg+xml', sizes: 'any' }
    ],
    shortcut: '/brand/uml-platform-logo.png',
    apple: { url: '/brand/uml-platform-logo.png', sizes: '192x192', type: 'image/png' }
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='zh-CN' data-template='admincn' suppressHydrationWarning>
      <body className='flex min-h-full w-full flex-auto flex-col font-sans antialiased'><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
