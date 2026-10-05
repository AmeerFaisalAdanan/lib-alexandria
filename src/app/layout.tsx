import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Navigation } from '@/components/app-shell/navigation';
import { StoreHydrator } from '@/components/store-hydrator';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Library of Alexandria',
  description: 'A shared book catalogue with your own reading tracker',
};

export const viewport: Viewport = {
  themeColor: '#020618',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${jakarta.variable}`}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <StoreHydrator />
        <div className="flex min-h-dvh flex-col md:flex-row">
          <Navigation />
          <div className="pb-nav flex min-w-0 flex-1 flex-col md:pb-0 md:pl-64">{children}</div>
        </div>
        <Toaster position="top-center" richColors closeButton={false} duration={2500} />
      </body>
    </html>
  );
}
