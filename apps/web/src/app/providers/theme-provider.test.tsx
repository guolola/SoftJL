// Verifies theme persistence without applying obsolete density preferences.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { ThemeProvider, themePresets, useTheme } from './theme-provider';
afterEach(() => {
  localStorage.clear();
  const presetKeys = new Set(
    Object.values(themePresets).flatMap((preset) =>
      Object.values(preset.styles).flatMap((styles) => Object.keys(styles)),
    ),
  );
  for (const key of presetKeys) {
    document.documentElement.style.removeProperty(`--${key}`);
  }
  document.documentElement.classList.remove('dark');
});
function Toggle() { const { theme, toggle } = useTheme(); return <button onClick={toggle}>{theme}</button>; }
function PresetControls() {
  const { themePreset, setThemePreset } = useTheme();
  return <>
    <output aria-label="theme preset">{themePreset}</output>
    <button onClick={() => setThemePreset('classic-indigo')}>classic-indigo</button>
    <button onClick={() => setThemePreset('caffeine')}>caffeine</button>
    <button onClick={() => setThemePreset('default')}>default</button>
  </>;
}
it('uses saved template theme and persists the next choice', async () => {
  localStorage.setItem('admincn-ui-theme', 'light');
  localStorage.setItem('uml-lab-settings', JSON.stringify({ fontSize: 'sm' }));
  render(<ThemeProvider><Toggle /></ThemeProvider>);
  await userEvent.click(await screen.findByRole('button', { name: 'light' }));
  await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  expect(localStorage.getItem('admincn-ui-theme')).toBe('dark');
  expect(document.documentElement.style.getPropertyValue('--font-size')).toBe('');
});

it('applies, persists, and clears an AdminCN color preset', async () => {
  localStorage.setItem('admincn-ui-theme', 'light');
  render(<ThemeProvider><PresetControls /></ThemeProvider>);

  await userEvent.click(screen.getByRole('button', { name: 'caffeine' }));
  await waitFor(() => expect(document.documentElement.style.getPropertyValue('--primary'))
    .toBe(themePresets.caffeine.styles.light.primary));
  expect(localStorage.getItem('admincn-ui-theme-preset')).toBe('caffeine');

  await userEvent.click(screen.getByRole('button', { name: 'default' }));
  await waitFor(() => expect(document.documentElement.style.getPropertyValue('--primary')).toBe(''));
  expect(localStorage.getItem('admincn-ui-theme-preset')).toBeNull();
});

it('applies and restores the Classic Indigo preset in light and dark modes', async () => {
  localStorage.setItem('admincn-ui-theme', 'light');
  const view = render(
    <ThemeProvider>
      <Toggle />
      <PresetControls />
    </ThemeProvider>,
  );

  await userEvent.click(screen.getByRole('button', { name: 'classic-indigo' }));
  await waitFor(() => expect(document.documentElement.style.getPropertyValue('--primary'))
    .toBe(themePresets['classic-indigo'].styles.light.primary));
  expect(document.documentElement.style.getPropertyValue('--input-background'))
    .toBe(themePresets['classic-indigo'].styles.light['input-background']);
  expect(document.documentElement.style.getPropertyValue('--destructive')).toBe('');
  expect(localStorage.getItem('admincn-ui-theme-preset')).toBe('classic-indigo');

  view.unmount();
  render(
    <ThemeProvider>
      <Toggle />
      <PresetControls />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByRole('status', { name: 'theme preset' }))
    .toHaveTextContent('classic-indigo'));
  expect(document.documentElement.style.getPropertyValue('--primary'))
    .toBe(themePresets['classic-indigo'].styles.light.primary);

  await userEvent.click(screen.getByRole('button', { name: 'light' }));
  await waitFor(() => expect(document.documentElement.style.getPropertyValue('--primary'))
    .toBe(themePresets['classic-indigo'].styles.dark.primary));
  expect(document.documentElement.style.getPropertyValue('--primary-foreground'))
    .toBe(themePresets['classic-indigo'].styles.dark['primary-foreground']);
  expect(document.documentElement.style.getPropertyValue('--input-background'))
    .toBe(themePresets['classic-indigo'].styles.dark['input-background']);
  expect(document.documentElement.style.getPropertyValue('--destructive')).toBe('');

  await userEvent.click(screen.getByRole('button', { name: 'default' }));
  await waitFor(() => expect(document.documentElement.style.getPropertyValue('--primary')).toBe(''));
  expect(document.documentElement.style.getPropertyValue('--input-background')).toBe('');
  expect(localStorage.getItem('admincn-ui-theme-preset')).toBeNull();
});

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = hex.match(/[\da-f]{2}/giu)?.map((channel) => Number.parseInt(channel, 16) / 255);
    if (!channels || channels.length !== 3) throw new Error(`Expected a six-digit hex color, received ${hex}`);
    const [red, green, blue] = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

it.each(['light', 'dark'] as const)(
  'keeps Classic Indigo %s text and control pairs at WCAG AA contrast',
  (theme) => {
    const styles = themePresets['classic-indigo'].styles[theme];
    const pairs = [
      ['foreground', 'background'],
      ['card-foreground', 'card'],
      ['popover-foreground', 'popover'],
      ['primary-foreground', 'primary'],
      ['secondary-foreground', 'secondary'],
      ['muted-foreground', 'muted'],
      ['accent-foreground', 'accent'],
      ['sidebar-foreground', 'sidebar'],
      ['sidebar-primary-foreground', 'sidebar-primary'],
      ['sidebar-accent-foreground', 'sidebar-accent'],
    ] as const;

    for (const [foreground, background] of pairs) {
      expect(
        contrastRatio(styles[foreground], styles[background]),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  },
);
