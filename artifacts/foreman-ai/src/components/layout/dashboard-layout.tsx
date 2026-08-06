import React from 'react';
import { Sidebar } from './sidebar';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] bg-background w-full">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 pb-24 md:pb-8 w-full">
          <div className="mx-auto max-w-6xl w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}