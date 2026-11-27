import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export interface AdminRootLayoutProps {
  readonly children: ReactNode;
}

export default function AdminRootLayout({
  children,
}: Readonly<AdminRootLayoutProps>) {
  return children;
}
