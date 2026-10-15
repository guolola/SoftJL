// Adapts the AdminCN default-layout Header source to platform navigation and actions.
import type { ReactNode } from 'react';
import { SidebarTrigger } from '../../ui/sidebar';
import { Separator } from '../../ui/separator';

export function AdmincnHeader({ navigation, actions, showSidebar = true }: { navigation: ReactNode; actions: ReactNode; showSidebar?: boolean }) {
  return (
    <header className='sticky top-0 z-50 px-4 before:absolute before:inset-0 before:rounded-t-xl before:mask-[linear-gradient(var(--card),var(--card)_18%,transparent_100%)] before:backdrop-blur-md sm:px-6'>
      <div className='bg-card relative z-51 mx-auto mt-3 flex min-h-10 w-full max-w-348 items-center justify-between rounded-xl border px-6 py-2'>
        <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-4">
          {showSidebar && <SidebarTrigger className="[&_svg]:size-5!" />}
          <Separator orientation="vertical" className="hidden h-4! self-center! sm:block" />
          {navigation}
        </div>
        {/* Keep the navigation trigger reachable when tablet/mobile actions exceed the available width. */}
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{actions}</div>
      </div>
    </header>
  );
}
