// Guards official client artwork and accessible naming in the MCP directory.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { i18n } from '@/shared/i18n';
import { ClientCatalog } from './client-catalog';

beforeEach(async () => { await i18n.changeLanguage('zh-CN'); });

it('shows official WorkBuddy and VS Code artwork with the VS Code product name', () => {
  render(<ClientCatalog onSelect={vi.fn()} serverUrl="" onCopy={vi.fn().mockResolvedValue(true)} />);
  for (const [name, src] of [['WorkBuddy', '/mcp/clients/workbuddy.svg'], ['VS Code', '/mcp/clients/vscode.svg']]) {
    const heading = screen.getByRole('heading', { name });
    const card = heading.closest('article')!;
    expect(card.querySelector('img')).toHaveAttribute('src', src);
    expect(card.querySelector('img')).toHaveClass('object-contain');
    expect(card.querySelector('img')).not.toHaveClass('bg-white');
    expect(within(card).getByRole('button', { name: '查看 ' + name + ' 接入指南' })).toBeVisible();
  }
  expect(screen.queryByText('VS Code MCP Agent')).not.toBeInTheDocument();
  expect(i18n.t('mcp.title', { lng: 'zh-CN' })).toBe('编程助手');
  expect(i18n.t('mcp.title', { lng: 'en' })).toBe('Coding assistants');
});
