import './globals.css';
import { Navigation } from '../components/Navigation';
import { Toast } from '../components/Toast';

export const metadata = {
  title: 'Library of Alexandria',
  description: 'Mobile-first shared library management prototype',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body class="bg-slate-950 text-slate-100 antialiased min-h-screen">
        <div class="min-h-screen flex flex-col md:flex-row bg-slate-950">
          <Navigation />
          <div class="flex-1 md:pl-64 flex flex-col min-w-0">
            {children}
          </div>
        </div>
        <Toast />
      </body>
    </html>
  );
}
