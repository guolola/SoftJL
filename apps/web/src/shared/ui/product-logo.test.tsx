// Verifies standalone logos expose accessible names while decorative marks stay hidden.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ProductLogo } from './product-logo';

it('hides decorative marks and exposes an accessible name when used alone', () => {
  const { container } = render(<><ProductLogo /><ProductLogo aria-label="SoftJL" /></>);
  expect(container.querySelector('[data-slot="product-logo"]')).toHaveAttribute('aria-hidden', 'true');
  const namedLogo = screen.getByRole('img', { name: 'SoftJL' });
  expect(namedLogo).not.toHaveAttribute('aria-hidden');
  expect(namedLogo).toHaveAttribute('focusable', 'false');
});
