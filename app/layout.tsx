import './globals.css';
import React from 'react';
import Provider from '@/components/Provider';

export const metadata = {
  title: 'LifeOS — AI Voice-First Scheduling Assistant',
  description: 'Delegate your mental overhead. Speak your day, LifeOS handles your Google Calendar.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-indigo-500 selection:text-white">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
