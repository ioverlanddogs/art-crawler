import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
