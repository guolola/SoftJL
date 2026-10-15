// Verifies the entire sidebar brand returns to the public homepage without a page reload.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n';
import { SidebarProvider } from '../../ui/sidebar';
import { SidebarBrand } from './sidebar-brand';
describe('sidebar brand navigation', () => {
  it('makes the logo and product title one homepage link', async () => {
    const previous = window.location.pathname;
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const navigate = vi.fn(); window.addEventListener('popstate', navigate);
    try {
      window.history.replaceState({}, '', '/projects/example/lineage');
      render(<I18nextProvider i18n={i18n}><SidebarProvider><SidebarBrand /></SidebarProvider></I18nextProvider>);
      const brand = screen.getByRole('link', { name: i18n.t('common.appName') });
      expect(brand).toHaveAccessibleName('SoftJL');
      expect(brand).toHaveAttribute('href', '/'); expect(brand.querySelector('svg')).not.toBeNull();
      await userEvent.setup().click(screen.getByText(i18n.t('common.appTagline')));
      expect(window.location.pathname).toBe('/'); expect(navigate).toHaveBeenCalledOnce();
    } finally { window.removeEventListener('popstate', navigate); window.history.replaceState({}, '', previous); scroll.mockRestore(); }
  });
});
