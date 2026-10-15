// Adapts template links to the existing History API router without changing their DOM or styles.
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

const TemplateLink = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<'a'>>(
  function TemplateLink({ href = '/', onClick, children, ...props }, ref) {
    return <a ref={ref} href={href} {...props} onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target || props.download) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      event.preventDefault();
      window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
      if (url.hash) requestAnimationFrame(() => document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }));
      else window.scrollTo(0, 0);
    }}>{children}</a>;
  },
);
export default TemplateLink;
