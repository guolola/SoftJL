// Shares a folded Software monogram across page brands and standalone app badges.
import type { SVGProps } from 'react';
import { cn } from './utils';

type ProductLogoProps = SVGProps<SVGSVGElement> & {
  variant?: 'mark' | 'badge';
};

export function ProductLogo({ className, variant = 'mark', ...props }: ProductLogoProps) {
  const labelled = Boolean(props['aria-label'] || props['aria-labelledby']);
  const badge = variant === 'badge';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="64"
      height="64"
      viewBox={badge ? '0 0 64 64' : '8 8 48 48'}
      fill="none"
      data-slot="product-logo"
      data-variant={variant}
      aria-hidden={labelled ? undefined : true}
      role={labelled ? 'img' : undefined}
      focusable="false"
      className={cn('shrink-0', className)}
      {...props}
    >
      {/* The page theme controls SVG colors directly, avoiding image swaps during hydration. */}
      {badge && <rect width="64" height="64" rx="18" fill="#18181b" className="dark:fill-zinc-100" />}
      {/* One continuous, rotationally balanced ribbon stays legible at navigation and favicon sizes. */}
      <path
        d="M29 10H54L44 20H30L23 27H40C50 27 54 35 47 42L35 54H10L20 44H34L41 37H24C14 37 10 29 17 22L29 10Z"
        fill={badge ? '#fafafa' : '#18181b'}
        className={badge ? 'dark:fill-zinc-900' : 'dark:fill-zinc-100'}
      />
    </svg>
  );
}
