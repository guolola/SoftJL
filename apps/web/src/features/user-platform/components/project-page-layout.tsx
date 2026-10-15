// Provides shared project page scaffolding used by user-platform subpages.
import { Card } from '../../../shared/ui/card';
import { PageContainer } from '../../../shared/template/layout/page';
type ProjectPageFrameProps = {
  children: React.ReactNode;
  onNavigate?: (path: string) => void;
};

const STABLE_PLATFORM_SCROLL_CLASS =
  "min-h-0 min-w-0 w-full overflow-x-clip bg-background";

export function PageFrame({ children }: ProjectPageFrameProps) {
  return (
    <main className={STABLE_PLATFORM_SCROLL_CLASS}>
      <PageContainer className="flex flex-col gap-6">
        {children}
      </PageContainer>
    </main>
  );
}

export function SectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`gap-0 p-5 shadow-none ${className}`}>
      {children}
    </Card>
  );
}
