// Verifies the template dialog restores focus and leaves the page usable after closing.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from './dialog';
it('closes with Escape, restores focus, and permits reopening', async () => {
  const user = userEvent.setup();
  render(<Dialog><DialogTrigger>Open</DialogTrigger><DialogContent><DialogTitle>Details</DialogTitle><DialogDescription>Project information</DialogDescription></DialogContent></Dialog>);
  const trigger = screen.getByRole('button', { name: 'Open' });
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toBeVisible();
  expect(dialog).toHaveClass('data-open:zoom-in-0!', 'data-open:duration-600', 'motion-reduce:animate-none');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  expect(await screen.findByRole('dialog')).toBeVisible();
});
