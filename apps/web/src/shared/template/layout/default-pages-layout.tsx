// Uses the AdminCN default-layout PagesLayout source with platform route slots.
import type { ReactNode } from 'react';
import { SidebarInset } from '../../ui/sidebar';
import { cn } from '../../ui/utils';

export function DefaultPagesLayout({
  sidebar,
  header,
  children,
  contentClassName,
  className,
}: {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex h-full w-full min-w-0', className)}>
      {sidebar}
      <SidebarInset className='flex min-w-0 flex-1 flex-col'>
        {header}
        <main className={cn('mx-auto size-full flex-1 px-4 py-6 sm:px-6', contentClassName)}>
          {children}
        </main>
      </SidebarInset>
    </div>
  );
}
