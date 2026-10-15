// Verifies shared brand integration, accessible naming, and theme switching without replacing the SVG.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './theme-provider';
import { ProductLogo } from './product-logo';

function Toggle() {
  const { toggle } = useTheme();
  return <button onClick={toggle}>Toggle theme</button>;
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('light', 'dark');
});

it('hides decorative marks and exposes an accessible name when used alone', () => {
  const { container } = render(<><ProductLogo /><ProductLogo aria-label="SoftJL" /></>);
  expect(container.querySelector('[data-slot="product-logo"]')).toHaveAttribute('aria-hidden', 'true');
  const namedLogo = screen.getByRole('img', { name: 'SoftJL' });
  expect(namedLogo).not.toHaveAttribute('aria-hidden');
  expect(namedLogo).toHaveAttribute('focusable', 'false');
});

it('keeps both marks mounted while the shared theme switches and persists', async () => {
  localStorage.setItem('admincn-ui-theme', 'light');
  const { container } = render(<ThemeProvider><Toggle /><ProductLogo /><ProductLogo /></ThemeProvider>);
  const marks = Array.from(container.querySelectorAll('[data-slot="product-logo"]'));
  await userEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
  await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  expect(localStorage.getItem('admincn-ui-theme')).toBe('dark');
  expect(Array.from(container.querySelectorAll('[data-slot="product-logo"]'))).toEqual(marks);
  await userEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
  await waitFor(() => expect(document.documentElement).toHaveClass('light'));
  expect(localStorage.getItem('admincn-ui-theme')).toBe('light');
});

it('uses an unboxed navigation mark and a single background for app badges', () => {
  const { container } = render(<><ProductLogo /><ProductLogo variant="badge" /></>);
  const marks = container.querySelectorAll('[data-slot="product-logo"]');
  expect(marks[0].querySelector('rect')).toBeNull();
  expect(marks[1].querySelectorAll('rect')).toHaveLength(1);
  expect(marks[0].querySelector('path')?.getAttribute('d')).toBe(marks[1].querySelector('path')?.getAttribute('d'));
});
