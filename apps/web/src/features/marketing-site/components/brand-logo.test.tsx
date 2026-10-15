// Checks that marketing and workspace adapters share the same theme-aware brand mark.
import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import WorkspaceLogo from '@/shared/template/assets/svg/logo';
import MarketingLogo from '../template/assets/svg/flow-logo';

it('uses the same inline mark in workspace and marketing adapters', () => {
  const { container } = render(<><WorkspaceLogo className="size-9" /><MarketingLogo className="size-15" /></>);
  const marks = container.querySelectorAll('[data-slot="product-logo"]');
  expect(marks).toHaveLength(2);
  expect(marks[0].tagName.toLowerCase()).toBe('svg');
  expect(marks[0].innerHTML).toBe(marks[1].innerHTML);
  expect(marks[0]).toHaveClass('size-9');
  expect(marks[1]).toHaveClass('size-15');
  expect(container.querySelector('img')).toBeNull();
});
