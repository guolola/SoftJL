// Preserves dashboard-dialog-37 setting rows and sample previews; fixed sample fields are not platform preferences.
import type { CSSProperties, ReactNode } from 'react';
import { Card } from '@/shared/ui/card';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { cn } from '@/shared/ui/utils';
import { themePresets, type ThemePresetKey } from '@/shared/ui/theme-provider';
import { resolveLocalePreference } from '@/shared/i18n/locale';

type ThemeMode = 'light' | 'dark' | 'system'
type AccentId = 'indigo' | 'emerald' | 'rose' | 'amber' | 'sky' | 'violet'
type RadiusId = 'sharp' | 'soft' | 'round' | 'pill'
type FontId = 'sans' | 'georgia' | 'mono'
type CardStyle = 'bordered' | 'elevated' | 'flat'
type Density = 'compact' | 'comfortable' | 'spacious'
type SidebarMode = 'expanded' | 'collapsed'
type SidebarPosition = 'left' | 'right'
type ContentWidth = 'full' | 'centered'
type DateFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
type TimeFormat = '12h' | '24h'
type NumberStyle = 'auto' | 'en-US' | 'de-DE' | 'fr-FR' | 'en-IN'
type WeekStart = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'
type LineSpacing = 'tight' | 'normal' | 'relaxed'

type Settings = {
  theme: ThemeMode
  accent: AccentId
  font: FontId
  radius: RadiusId
  cardStyle: CardStyle
  density: Density
  sidebar: SidebarMode
  sidebarPosition: SidebarPosition
  contentWidth: ContentWidth
  workspaceName: string
  breadcrumbs: boolean
  language: string
  dateFormat: DateFormat
  timeFormat: TimeFormat
  numberFormat: NumberStyle
  weekStart: WeekStart
  reduceMotion: boolean
  highContrast: boolean
  underlineLinks: boolean
  fontSize: number
  lineSpacing: LineSpacing
  shortcutsEnabled: boolean
  shortcuts: Record<string, string[]>
}

type Option<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
}

const ACCENTS: {
  id: AccentId
  label: string
  swatch: string
  ring: string
  light: string
  dark: string
  system: string
}[] = [
  {
    id: 'indigo',
    label: 'Indigo',
    swatch: 'bg-indigo-600 dark:bg-indigo-400',
    ring: 'ring-indigo-600 dark:ring-indigo-400',
    light: '[--primary:var(--color-indigo-600)]',
    dark: '[--primary:var(--color-indigo-400)]!',
    system: '[--primary:var(--color-indigo-600)] dark:[--primary:var(--color-indigo-400)]'
  },
  {
    id: 'emerald',
    label: 'Emerald',
    swatch: 'bg-emerald-600 dark:bg-emerald-400',
    ring: 'ring-emerald-600 dark:ring-emerald-400',
    light: '[--primary:var(--color-emerald-600)]',
    dark: '[--primary:var(--color-emerald-400)]!',
    system: '[--primary:var(--color-emerald-600)] dark:[--primary:var(--color-emerald-400)]'
  },
  {
    id: 'rose',
    label: 'Rose',
    swatch: 'bg-rose-600 dark:bg-rose-400',
    ring: 'ring-rose-600 dark:ring-rose-400',
    light: '[--primary:var(--color-rose-600)]',
    dark: '[--primary:var(--color-rose-400)]!',
    system: '[--primary:var(--color-rose-600)] dark:[--primary:var(--color-rose-400)]'
  },
  {
    id: 'amber',
    label: 'Amber',
    swatch: 'bg-amber-600 dark:bg-amber-400',
    ring: 'ring-amber-600 dark:ring-amber-400',
    light: '[--primary:var(--color-amber-600)]',
    dark: '[--primary:var(--color-amber-400)]!',
    system: '[--primary:var(--color-amber-600)] dark:[--primary:var(--color-amber-400)]'
  },
  {
    id: 'sky',
    label: 'Sky',
    swatch: 'bg-sky-600 dark:bg-sky-400',
    ring: 'ring-sky-600 dark:ring-sky-400',
    light: '[--primary:var(--color-sky-600)]',
    dark: '[--primary:var(--color-sky-400)]!',
    system: '[--primary:var(--color-sky-600)] dark:[--primary:var(--color-sky-400)]'
  },
  {
    id: 'violet',
    label: 'Violet',
    swatch: 'bg-violet-600 dark:bg-violet-400',
    ring: 'ring-violet-600 dark:ring-violet-400',
    light: '[--primary:var(--color-violet-600)]',
    dark: '[--primary:var(--color-violet-400)]!',
    system: '[--primary:var(--color-violet-600)] dark:[--primary:var(--color-violet-400)]'
  }
]

const RADIUS_VALUES: Record<RadiusId, string> = {
  sharp: '0rem',
  soft: '0.5rem',
  round: '0.875rem',
  pill: '2rem'
}

const FONT_FAMILIES: Record<FontId, string> = {
  sans: 'var(--font-sans, ui-sans-serif), system-ui, sans-serif',
  georgia: "Georgia, 'Times New Roman', Times, serif",
  mono: 'var(--font-mono, ui-monospace), SFMono-Regular, Menlo, monospace'
}

const CARD_STYLE_CLASSES: Record<CardStyle, string> = {
  bordered: 'bg-card border',
  elevated: 'bg-card border border-transparent shadow-md',
  flat: 'bg-muted/50 border border-transparent'
}

const MODE_CLASSES: Record<ThemeMode, string> = {
  light:
    '[--background:var(--color-white)] [--foreground:var(--color-black)] [--card:var(--color-white)] [--card-foreground:var(--color-black)] [--muted:color-mix(in_oklab,var(--color-black)_5%,var(--color-white))] [--muted-foreground:var(--color-neutral-600)] [--border:color-mix(in_oklab,var(--color-black)_10%,var(--color-white))] [--primary-foreground:var(--color-white)]',
  dark: 'dark [--primary-foreground:var(--color-black)]!',
  system: '[--primary-foreground:var(--color-white)] dark:[--primary-foreground:var(--color-black)]'
}

const LANGUAGES: {
  value: string
  label: string
  flag: string
  greeting: string
  currency: string
}[] = [
  { value: 'zh-CN', label: '中文', flag: '🇨🇳', greeting: '下午好', currency: 'CNY' },
  { value: 'en-US', label: 'English (United States)', flag: '🇺🇸', greeting: 'Good afternoon', currency: 'USD' },
  { value: 'en-GB', label: 'English (United Kingdom)', flag: '🇬🇧', greeting: 'Good afternoon', currency: 'GBP' },
  { value: 'es-ES', label: 'Español', flag: '🇪🇸', greeting: 'Buenas tardes', currency: 'EUR' },
  { value: 'fr-FR', label: 'Français', flag: '🇫🇷', greeting: 'Bon après-midi', currency: 'EUR' },
  { value: 'de-DE', label: 'Deutsch', flag: '🇩🇪', greeting: 'Guten Tag', currency: 'EUR' },
  { value: 'ja-JP', label: '日本語', flag: '🇯🇵', greeting: 'こんにちは', currency: 'JPY' },
  { value: 'hi-IN', label: 'हिन्दी', flag: '🇮🇳', greeting: 'नमस्ते', currency: 'INR' }
]

const WEEK_STARTS: { value: WeekStart; label: string; dayIndex: number }[] = [
  { value: 'sunday', label: 'Sunday', dayIndex: 0 },
  { value: 'monday', label: 'Monday', dayIndex: 1 },
  { value: 'tuesday', label: 'Tuesday', dayIndex: 2 },
  { value: 'wednesday', label: 'Wednesday', dayIndex: 3 },
  { value: 'thursday', label: 'Thursday', dayIndex: 4 },
  { value: 'friday', label: 'Friday', dayIndex: 5 },
  { value: 'saturday', label: 'Saturday', dayIndex: 6 }
]

const PREVIEW_NAV = ['Home', 'Reports', 'Team', 'Billing']

const PREVIEW_STATS: { label: string; value: string; bars: number[] }[] = [
  { label: 'Revenue', value: '$24.6k', bars: [40, 65, 50, 80, 62] },
  { label: 'Orders', value: '1,284', bars: [55, 40, 70, 58, 75] },
  { label: 'Visitors', value: '8.2k', bars: [30, 45, 60, 52, 88] }
]

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: 'indigo',
  font: 'sans',
  radius: 'soft',
  cardStyle: 'bordered',
  density: 'comfortable',
  sidebar: 'expanded',
  sidebarPosition: 'left',
  contentWidth: 'full',
  workspaceName: 'Acme',
  breadcrumbs: true,
  language: 'en-US',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  numberFormat: 'auto',
  weekStart: 'sunday',
  reduceMotion: false,
  highContrast: false,
  underlineLinks: false,
  fontSize: 14,
  lineSpacing: 'normal',
  shortcutsEnabled: true,
  shortcuts: {}
}

const SAMPLE_DATE = new Date(2026, 9, 6, 14, 30)

const formatSampleDate = (format: DateFormat) => {
  if (format === 'MM/DD/YYYY') return '10/06/2026'
  if (format === 'DD/MM/YYYY') return '06/10/2026'

  return '2026-10-06'
}

const formatNumberSample = (numberFormat: NumberStyle, language: string) =>
  new Intl.NumberFormat(numberFormat === 'auto' ? language : numberFormat).format(1234567.89)

const getThemeStyle = (settings: Settings) =>
  ({
    '--radius': RADIUS_VALUES[settings.radius],
    fontFamily: FONT_FAMILIES[settings.font],
    colorScheme: settings.theme === 'system' ? undefined : settings.theme
  }) as CSSProperties

const getThemeClasses = (settings: Settings) => {
  const accent = ACCENTS.find(item => item.id === settings.accent) ?? ACCENTS[0]

  return cn(MODE_CLASSES[settings.theme], accent[settings.theme])
}

const getWeekStrip = (locale: string, weekStart: WeekStart) => {
  const startIndex = WEEK_STARTS.find(item => item.value === weekStart)?.dayIndex ?? 0
  const diff = (SAMPLE_DATE.getDay() - startIndex + 7) % 7
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' })

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2026, 9, 6 - diff + index)

    return {
      date,
      key: date.toDateString(),
      label: formatter.format(date),
      day: date.getDate(),
      isToday: date.toDateString() === SAMPLE_DATE.toDateString(),
      isWeekend: date.getDay() === 0 || date.getDay() === 6
    }
  })
}

export const SettingRow = ({
  label,
  hint,
  htmlFor,
  children
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
}) => (
  <div className='flex flex-col gap-3 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6'>
    <div className='space-y-1'>
      <Label htmlFor={htmlFor} className='text-sm leading-none font-medium'>
        {label}
      </Label>
      {hint && <p className='text-muted-foreground text-sm'>{hint.replace(/[。.]+$/u, '')}</p>}
    </div>
    <div className='w-full shrink-0 sm:w-auto'>{children}</div>
  </div>
)

export const Segmented = <T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
}) => (
  <Tabs
    value={value}
    onValueChange={(next: unknown) => {
      const match = options.find(option => option.value === next)

      if (match) onChange(match.value)
    }}
  >
    <TabsList aria-label={label} className='bg-muted/50 h-9! w-full flex-row! sm:w-auto'>
      {options.map(option => (
        <TabsTrigger
          key={option.value}
          value={option.value}
          className='w-auto! flex-1 justify-center! gap-1.5 px-3 text-sm'
        >
          {option.icon}
          {option.label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
)

export const SelectField = <T extends string>({
  id,
  value,
  options,
  onChange
}: {
  id: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
}) => (
  <Select
    value={value}
    items={options}
    onValueChange={next => {
      const match = options.find(option => option.value === next)

      if (match) onChange(match.value)
    }}
  >
    <SelectTrigger id={id} className='h-9! w-full sm:w-56'>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
)

const AppPreview = ({ settings, palette }: { settings: Settings; palette: CSSProperties }) => {
  const isCollapsed = settings.sidebar === 'collapsed'
  const isRight = settings.sidebarPosition === 'right'
  const name = settings.workspaceName.trim() || 'Workspace'

  const spacing =
    settings.density === 'compact' ? 'gap-1.5 p-2' : settings.density === 'spacious' ? 'gap-4 p-4' : 'gap-3 p-3'

  const style = { ...getThemeStyle(settings), fontSize: `${settings.fontSize - 2}px` } as CSSProperties

  return (
    <div
      role='img'
      aria-label='Live preview'
      style={{ ...style, ...palette }}
      className={cn(
        'bg-background text-foreground overflow-hidden rounded-[min(var(--radius),2rem)] border shadow-xs transition-colors',
        getThemeClasses(settings)
      )}
    >
      <div className='bg-muted/50 flex items-center gap-1.5 border-b px-3 py-2'>
        {['bg-destructive', 'bg-amber-600 dark:bg-amber-400', 'bg-emerald-600 dark:bg-emerald-400'].map(color => (
          <span key={color} className={cn('size-3 rounded-full', color)} />
        ))}
        <span className='text-muted-foreground bg-background mx-auto max-w-[60%] truncate rounded-md border px-2 py-0.5 text-xs'>
          {name.toLowerCase().replace(/\s+/g, '-')}.app/overview
        </span>
      </div>
      <div className={cn('flex min-h-40 sm:min-h-52', isRight && 'flex-row-reverse')}>
        <div
          className={cn(
            'bg-muted/50 flex shrink-0 flex-col gap-1.5 p-2 transition-all',
            isRight ? 'border-l' : 'border-r',
            isCollapsed ? 'w-11 items-center' : 'w-24 sm:w-32'
          )}
        >
          <div className='mb-1 flex items-center gap-1.5'>
            <span className='bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-md text-xs font-semibold'>
              {name.charAt(0).toUpperCase()}
            </span>
            {!isCollapsed && <span className='truncate font-semibold'>{name}</span>}
          </div>
          {PREVIEW_NAV.map((item, index) => (
            <span
              key={item}
              className={cn(
                'text-muted-foreground flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs',
                index === 0 && 'bg-background text-foreground shadow-xs'
              )}
            >
              <span
                className={cn('size-2 shrink-0 rounded-sm', index === 0 ? 'bg-primary' : 'bg-muted-foreground/40')}
              />
              {!isCollapsed && <span className='truncate'>{item}</span>}
            </span>
          ))}
        </div>
        <div className='flex-1 overflow-hidden'>
          <div
            className={cn(
              'flex min-h-40 flex-col transition-all sm:min-h-52',
              spacing,
              settings.contentWidth === 'centered' && 'mx-auto max-w-[85%]'
            )}
          >
            {settings.breadcrumbs && <p className='text-muted-foreground truncate text-xs'>{name} / Overview</p>}
            <div className='flex items-center justify-between gap-2'>
              <p className='truncate text-sm font-semibold'>Overview</p>
              <span className='bg-primary text-primary-foreground shrink-0 rounded-md px-2 py-0.5 text-xs'>
                New report
              </span>
            </div>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
              {PREVIEW_STATS.map((stat, index) => (
                <Card
                  key={stat.label}
                  className={cn(
                    'gap-1 rounded-[min(var(--radius),1.5rem)] p-2 shadow-none ring-0',
                    CARD_STYLE_CLASSES[settings.cardStyle],
                    index === 2 && 'max-sm:hidden'
                  )}
                >
                  <p className='text-muted-foreground truncate text-xs'>{stat.label}</p>
                  <p className='font-semibold'>{stat.value}</p>
                  <div className='flex h-4 items-end gap-0.5'>
                    {stat.bars.map((bar, barIndex) => (
                      <span key={barIndex} style={{ height: `${bar}%` }} className='bg-primary/70 w-full rounded-sm' />
                    ))}
                  </div>
                </Card>
              ))}
            </div>
            <div className='mt-auto space-y-1'>
              <div className='text-muted-foreground flex justify-between text-xs'>
                <span>Monthly goal</span>
                <span>68%</span>
              </div>
              <div className='bg-primary/15 h-1.5 overflow-hidden rounded-full'>
                <div className='bg-primary h-full w-2/3 rounded-full' />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const LocalePreview = ({ settings }: { settings: Settings }) => {
  const locale = LANGUAGES.find(item => item.value === settings.language) ?? LANGUAGES[0]
  const week = getWeekStrip(settings.language, settings.weekStart)

  const fullDate = new Intl.DateTimeFormat(settings.language, { dateStyle: 'full' }).format(SAMPLE_DATE)
  const monthLabel = new Intl.DateTimeFormat(settings.language, { month: 'long', year: 'numeric' }).format(SAMPLE_DATE)

  const time = new Intl.DateTimeFormat(settings.language, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: settings.timeFormat === '12h'
  }).format(SAMPLE_DATE)

  const money = new Intl.NumberFormat(settings.language, { style: 'currency', currency: locale.currency }).format(
    1234.5
  )

  const firstDay = new Intl.DateTimeFormat(settings.language, { weekday: 'long' }).format(week[0].date)

  const chips = [locale.value, locale.currency, settings.timeFormat === '12h' ? '12-hour clock' : '24-hour clock']

  const stats = [
    { label: 'Date', value: formatSampleDate(settings.dateFormat) },
    { label: 'Time', value: time },
    { label: 'Amount', value: money },
    { label: 'Number', value: formatNumberSample(settings.numberFormat, settings.language) }
  ]

  return (
    <div
      style={{ fontFamily: FONT_FAMILIES[settings.font] }}
      className='bg-background text-foreground overflow-hidden rounded-xl border shadow-xs transition-colors'
    >
      <div className='bg-muted/50 flex items-center gap-3 border-b p-4'>
        <span
          aria-hidden='true'
          className='bg-background border-primary ring-primary/20 flex size-12 shrink-0 items-center justify-center rounded-xl border text-2xl ring-4'
        >
          {locale.flag}
        </span>
        <div className='flex-1 space-y-1'>
          <p className='text-muted-foreground truncate text-xs font-medium tracking-wide uppercase'>{locale.label}</p>
          <p className='truncate text-lg leading-tight font-semibold sm:text-xl'>{locale.greeting}</p>
          <p className='text-muted-foreground truncate text-sm'>{fullDate}</p>
        </div>
        <div className='hidden shrink-0 flex-col items-end gap-1 sm:flex'>
          {chips.map(chip => (
            <span key={chip} className='bg-background rounded-md border px-2 py-0.5 font-mono text-xs'>
              {chip}
            </span>
          ))}
        </div>
      </div>
      <div className='grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 sm:p-4 sm:pb-3'>
        {stats.map(stat => (
          <Card
            key={stat.label}
            className={cn('gap-0.5 px-3 py-2 shadow-none ring-0', CARD_STYLE_CLASSES[settings.cardStyle])}
          >
            <p className='text-muted-foreground text-xs'>{stat.label}</p>
            <p className='truncate text-sm font-semibold'>{stat.value}</p>
          </Card>
        ))}
      </div>
      <div className='space-y-2.5 p-3 pt-1 sm:p-4 sm:pt-1'>
        <div className='flex items-center justify-between gap-2'>
          <p className='truncate text-sm font-semibold capitalize'>{monthLabel}</p>
          <span className='text-muted-foreground bg-muted/50 shrink-0 rounded-md border px-2 py-0.5 text-xs'>
            Starts on <span className='text-foreground font-medium capitalize'>{firstDay}</span>
          </span>
        </div>
        <div className='grid grid-cols-7 gap-1.5'>
          {week.map((item, index) => (
            <Card
              key={item.key}
              className={cn(
                'items-center gap-1 border py-2 shadow-none ring-0 transition-colors',
                item.isWeekend ? 'bg-muted/50 text-muted-foreground' : 'bg-card',
                item.isToday && 'bg-primary text-primary-foreground border-primary shadow-sm'
              )}
            >
              <span className='max-w-full truncate px-0.5 text-xs font-medium tracking-wide uppercase opacity-80'>
                {item.label}
              </span>
              <span className='text-base leading-none font-semibold tabular-nums'>{item.day}</span>
              <span
                className={cn(
                  'size-1 rounded-full',
                  item.isToday ? 'bg-primary-foreground' : index === 0 ? 'bg-primary' : 'bg-transparent'
                )}
              />
            </Card>
          ))}
        </div>
        <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'>
          <span className='flex items-center gap-1.5'>
            <span className='bg-primary size-1.5 rounded-full' />
            Week start
          </span>
          <span className='flex items-center gap-1.5'>
            <span className='bg-primary size-2.5 rounded-sm' />
            Today
          </span>
          <span className='flex items-center gap-1.5'>
            <span className='bg-muted/50 size-2.5 rounded-sm border' />
            Weekend
          </span>
        </div>
      </div>
    </div>
  )
}


export type PreferencesDraft = { mode: ThemeMode; preset: ThemePresetKey; sidebar: 'expanded' | 'collapsed'; language: 'system' | 'zh-CN' | 'en' };

export function Block37Preview({ draft, resolvedTheme, kind }: { draft: PreferencesDraft; resolvedTheme: 'light' | 'dark'; kind: 'app' | 'locale' }) {
  const mode = draft.mode === 'system' ? resolvedTheme : draft.mode;
  const locale = resolveLocalePreference(draft.language);
  const settings = { ...DEFAULT_SETTINGS, theme: mode, sidebar: draft.sidebar, language: locale === 'en' ? 'en-US' : 'zh-CN' };
  const tokens = draft.preset === 'default' ? { primary: mode === 'dark' ? 'oklch(0.922 0 0)' : 'oklch(0.205 0 0)' } : themePresets[draft.preset].styles[mode];
  const palette = Object.fromEntries(Object.entries(tokens).map(([key,value]) => ['--' + key,value])) as CSSProperties;
  return kind === 'locale' ? <LocalePreview settings={settings} /> : <AppPreview settings={settings} palette={palette} />;
}
