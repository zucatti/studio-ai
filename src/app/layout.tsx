import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Auth0Provider } from '@auth0/nextjs-auth0';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { SignedUrlProvider } from '@/contexts/signed-url-context';
import { Toaster } from 'sonner';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'Studio IA - Production Vidéo',
  description: 'Application de production vidéo assistée par IA',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background`}
      >
        <Auth0Provider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            forcedTheme="dark"
            disableTransitionOnChange
          >
            <SignedUrlProvider>
              {children}
            </SignedUrlProvider>
            <Toaster theme="dark" richColors position="bottom-right" />
          </ThemeProvider>
        </Auth0Provider>
      </body>
    </html>
  );
}
