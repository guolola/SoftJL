// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'
import { useAppI18n } from "@/shared/i18n/i18n-provider";
import { useTranslation } from 'react-i18next';
import { FlowCopy } from '@/features/marketing-site/model/flow-copy';

import { useEffect, useState } from 'react'

import { ExternalLinkIcon, FolderKanbanIcon, LayoutDashboardIcon, LogInIcon, LogOutIcon, UserRoundCogIcon } from 'lucide-react'

import Link from '@/shared/lib/template-link'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/features/marketing-site/template/components/ui/tooltip'
import { PrimaryFlowButton, SecondaryFlowButton } from '@/features/marketing-site/template/components/ui/flow-button'
import { ModeToggle } from '@/features/marketing-site/template/components/layout/mode-toggle'

import { HeaderNavigation, HeaderNavigationSmallScreen, type Navigation } from '@/features/marketing-site/template/components/layout/header-navigation'

import FlowLogo from '@/features/marketing-site/template/assets/svg/flow-logo'
import GithubIcon from '@/features/marketing-site/template/assets/svg/github-icon'

import { cn } from '@/shared/ui/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar'
import { Button, buttonVariants } from '@/shared/ui/button'
import { ThemePresetMenu } from '@/shared/template/layout/theme-preset-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown-menu'
import {
  AUTH_SESSION_CHANGED_EVENT,
  notifyAuthSessionChanged,
  platformApi,
  type PlatformUser
} from '@/features/user-platform/services/platform-api'

type HeaderProps = {
  navigationData: Navigation[]
  className?: string
}

function MarketingAccountMenu({ user, loading }: { user: PlatformUser | null; loading: boolean }) {
  const { t } = useTranslation()
  if (loading) return <span className='bg-muted block size-10 animate-pulse rounded-full' aria-label={t('common.loading')} />
  if (!user) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <SecondaryFlowButton className='max-sm:[&>a]:size-10 max-sm:[&>a]:px-0' asChild>
            <Link href='/login'>
              <LogInIcon className='sm:hidden' />
              <span className='max-sm:sr-only'><FlowCopy text="Login" /></span>
            </Link>
          </SecondaryFlowButton>
        </TooltipTrigger>
        <TooltipContent><FlowCopy text="Login" /></TooltipContent>
      </Tooltip>
    )
  }

  const name = user.displayName || user.username || user.email
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('auth.account')}
        render={<Button type='button' variant='ghost' size='icon' className='relative size-10 rounded-full p-0' />}
      >
        <Avatar className='size-9'>
          <AvatarImage src={user.avatarUrl ?? undefined} alt={name} />
          <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className='ring-background absolute right-0.5 bottom-0.5 size-2 rounded-full bg-success ring-2' aria-hidden='true' />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-64'>
        <DropdownMenuLabel className='flex flex-col gap-0.5 px-2 py-2'>
          <span className='truncate text-sm font-semibold text-foreground'>{name}</span>
          <span className='truncate text-xs font-normal text-muted-foreground'>{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href='/dashboard' />}><LayoutDashboardIcon />{t('nav.dashboard')}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href='/projects' />}><FolderKanbanIcon />{t('nav.projects')}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href='/dashboard?account=profile' />}><UserRoundCogIcon />{t('auth.account')}</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant='destructive'
          onClick={() => {
            void platformApi.logout().finally(() => {
              notifyAuthSessionChanged()
              window.history.pushState({}, '', '/')
              window.dispatchEvent(new PopStateEvent('popstate'))
            })
          }}
        >
          <LogOutIcon />{t('account.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const Header = ({ navigationData, className }: HeaderProps) => {
  const { i18n } = useTranslation();
  const { setPreference } = useAppI18n();
  const [isScrolled, setIsScrolled] = useState(false)
  const [sessionUser, setSessionUser] = useState<PlatformUser | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0)
    }

    window.addEventListener('scroll', handleScroll)
    handleScroll()

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadSession = () => {
      setSessionLoading(true)
      platformApi.me()
        .then(response => { if (active) setSessionUser(response.user ?? null) })
        .catch(() => { if (active) setSessionUser(null) })
        .finally(() => { if (active) setSessionLoading(false) })
    }
    loadSession()
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, loadSession)
    return () => {
      active = false
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, loadSession)
    }
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-50 h-16 w-full transition-all duration-300',
        {
          'bg-card/75 backdrop-blur-sm': isScrolled
        },
        className
      )}
    >
      <div className='flex h-full items-center justify-between gap-2 border-b px-3 sm:gap-4 sm:px-6 lg:px-8'>
        {/* Logo */}
        <Link href='/#home'>
          <div className='flex items-center gap-3'>
            <FlowLogo className='size-9 shrink-0 object-contain' />
            <span className='text-xl font-semibold max-[430px]:hidden'><FlowCopy text="Flow" /></span>
          </div>
        </Link>

        {/* Navigation */}
        <HeaderNavigation
          navigationData={navigationData}
          navigationClassName='[&_[data-slot="navigation-menu-list"]]:gap-1'
        />

        {/* Actions */}
        <div className='flex shrink-0 items-center gap-1 sm:gap-4 lg:gap-6'>
          {/* Offset the extra visual whitespace between the two unfilled icon buttons. */}
          <a
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), '-mr-1 size-10 rounded-lg sm:-mr-2 lg:-mr-3')}
            href='https://github.com/guolola/SoftJL'
            target='_blank'
            rel='noopener noreferrer'
            title='GitHub'
            aria-label='GitHub'
          >
            <GithubIcon className='size-5' />
          </a>

          <ThemePresetMenu className='size-10 rounded-lg' />

          <ModeToggle />

          <MarketingAccountMenu user={sessionUser} loading={sessionLoading} />

          <PrimaryFlowButton className='max-sm:hidden' onClick={() => setPreference(i18n.resolvedLanguage === 'en' ? 'zh-CN' : 'en')}>{i18n.resolvedLanguage === 'en' ? '中文' : 'English'}</PrimaryFlowButton>

          <Tooltip>
            <TooltipTrigger asChild>
              <PrimaryFlowButton className='sm:hidden **:data-[slot=button]:size-10 **:data-[slot=button]:px-0' onClick={() => setPreference(i18n.resolvedLanguage === 'en' ? 'zh-CN' : 'en')} aria-label={i18n.resolvedLanguage === 'en' ? 'Switch to Chinese' : 'Switch to English'}>
                  <ExternalLinkIcon />
                </PrimaryFlowButton>
            </TooltipTrigger>
            <TooltipContent>{i18n.resolvedLanguage === 'en' ? '中文' : 'English'}</TooltipContent>
          </Tooltip>

          <HeaderNavigationSmallScreen
            triggerClassName='**:data-[slot=sheet-trigger]:size-10 **:data-[slot=sheet-trigger]:px-0'
            navigationData={navigationData}
          />
        </div>
      </div>
    </header>
  )
}

export default Header
