// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';

import { useEffect, useState, type ReactNode } from 'react'

import { usePathname } from '@/shared/lib/template-navigation'

import Link from '@/shared/lib/template-link'

import { useMedia } from 'react-use'
import { ChevronRightIcon, CircleSmallIcon, MenuIcon } from 'lucide-react'

import { useActiveSection } from '@/features/marketing-site/template/hooks/use-active-section'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/features/marketing-site/template/components/ui/collapsible'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle
} from '@/features/marketing-site/template/components/ui/navigation-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/features/marketing-site/template/components/ui/sheet'
import { SecondaryFlowButton } from '@/features/marketing-site/template/components/ui/flow-button'

import Logo from '@/features/marketing-site/template/components/logo'

import { cn } from '@/shared/ui/utils'

type NavigationSection = {
  type: 'section'
  title: string
  items: NavigationItem[]
}

type NavigationItem = {
  title: string
  href: string
  icon?: ReactNode
  badge?: ReactNode
  description?: string
}

type Navigation = {
  title: string
  contentClassName?: string
} & (
  | {
      items: NavigationSection[]
      splitItems: true
      href?: never
    }
  | {
      items: NavigationItem[]
      splitItems?: never | false
      href?: never
    }
  | {
      items?: never
      splitItems?: never
      href: string
    }
)

const ListItem = (props: {
  title: NavigationItem['title']
  href: NavigationItem['href']
  icon?: NavigationItem['icon']
  badge?: NavigationItem['badge']
  description?: NavigationItem['description']
  splitItems?: boolean
  activeSection?: string
  pathname?: string
}) => {
  const { title, href, icon, badge, description, splitItems, activeSection, pathname } = props

  // Extract section id from href (e.g., '#home' -> 'home')
  const sectionId = href.startsWith('/#') ? href.slice(2) : href.startsWith('#') ? href.slice(1) : ''
  const isActive = sectionId ? activeSection === sectionId : pathname?.startsWith(href)

  return (
    <li className={cn({ 'h-19.5': description && splitItems })}>
      <NavigationMenuLink
        href={href}
        data-active={isActive}
        className={cn({ 'flex flex-row items-start gap-2': icon })}
        asChild
      >
        <Link href={href}>
          {icon && (
            <span className='bg-popover [&>svg]:text-popover-foreground! flex aspect-square size-7 shrink-0 items-center justify-center rounded-sm border [&>svg]:size-4'>
              {icon}
            </span>
          )}
          {description ? (
            <div className='space-y-0.5'>
              <div className={cn('font-medium', { 'flex items-center gap-1.5': badge })}>
                {flowText(title)}
                {badge}
              </div>
              <p className='text-muted-foreground line-clamp-2'>{flowText(description ?? '')}</p>
            </div>
          ) : (
            <div className={cn('font-medium', { 'flex items-center gap-1.5': badge })}>
              {flowText(title)}
              {badge}
            </div>
          )}
        </Link>
      </NavigationMenuLink>
    </li>
  )
}

const HeaderNavigation = ({
  navigationData,
  navigationClassName
}: {
  navigationData: Navigation[]
  navigationClassName?: string
}) => {
  const pathname = usePathname()

  // Extract all section IDs from navigation data
  const sectionIds = navigationData.flatMap(navItem => {
    if (navItem.href) {
      const id = navItem.href.startsWith('/#')
        ? navItem.href.slice(2)
        : navItem.href.startsWith('#')
          ? navItem.href.slice(1)
          : ''

      return id ? [id] : []
    }

    if (navItem.items) {
      if (navItem.splitItems) {
        return navItem.items.flatMap(section =>
          section.items
            .map(item => {
              const id = item.href.startsWith('/#')
                ? item.href.slice(2)
                : item.href.startsWith('#')
                  ? item.href.slice(1)
                  : ''

              return id
            })
            .filter(Boolean)
        )
      }

      return navItem.items
        .map(item => {
          const id = item.href.startsWith('/#')
            ? item.href.slice(2)
            : item.href.startsWith('#')
              ? item.href.slice(1)
              : ''

          return id
        })
        .filter(Boolean)
    }

    return []
  })

  const activeSection = useActiveSection(sectionIds)

  return (
    <NavigationMenu viewport={false} className={cn('hidden lg:block', navigationClassName)}>
      <NavigationMenuList className='h-fit flex-wrap gap-6!'>
        {navigationData.map(navItem => {
          if (navItem.href) {
            // Root link item
            const sectionId = navItem.href.startsWith('/#')
              ? navItem.href.slice(2)
              : navItem.href.startsWith('#')
                ? navItem.href.slice(1)
                : ''

            const isActive = sectionId ? activeSection === sectionId : pathname?.startsWith(navItem.href)

            return (
              <NavigationMenuItem key={flowText(navItem.title)}>
                <NavigationMenuLink
                  href={navItem.href}
                  data-active={isActive}
                  className={cn(
                    navigationMenuTriggerStyle(),
                    'text-muted-foreground! hover:text-foreground! data-[active=true]:text-foreground! bg-transparent! p-0! text-base'
                  )}
                >
                  {flowText(navItem.title)}
                </NavigationMenuLink>
              </NavigationMenuItem>
            )
          }

          // Section with dropdown
          // Check if any child item is active
          let hasActiveChild = false

          if (navItem.items) {
            if (navItem.splitItems) {
              hasActiveChild = navItem.items.some(section =>
                section.items.some(item => {
                  const id = item.href.startsWith('/#')
                    ? item.href.slice(2)
                    : item.href.startsWith('#')
                      ? item.href.slice(1)
                      : ''

                  return id && activeSection === id
                })
              )
            } else {
              hasActiveChild = navItem.items.some(item => {
                const id = item.href.startsWith('/#')
                  ? item.href.slice(2)
                  : item.href.startsWith('#')
                    ? item.href.slice(1)
                    : ''

                return id && activeSection === id
              })
            }
          }

          return (
            <NavigationMenuItem key={flowText(navItem.title)}>
              <NavigationMenuTrigger
                data-active={hasActiveChild}
                className='text-muted-foreground! data-[active=true]:text-foreground! bg-transparent! p-0! text-base [&_svg]:size-4'
              >
                {flowText(navItem.title)}
              </NavigationMenuTrigger>
              <NavigationMenuContent className='absolute left-1/2 w-auto -translate-x-1/2 shadow-lg!'>
                {navItem.splitItems ? (
                  <div className={cn('grid grid-cols-1 gap-2', navItem.contentClassName)}>
                    {navItem.items.map(section => (
                      <div key={flowText(section.title)} className='grid grid-cols-1 gap-2'>
                        <div className='text-muted-foreground px-2 text-sm'>{flowText(section.title)}</div>
                        <ul
                          className={cn('grid grid-cols-1 gap-0.5', {
                            'gap-2': section.items.find(item => 'description' in item && item.description)
                          })}
                        >
                          {section.items.map((item, index) => (
                            <ListItem
                              key={index}
                              icon={item.icon}
                              title={flowText(item.title)}
                              description={flowText(item.description)}
                              href={item.href}
                              badge={item.badge}
                              splitItems={navItem.splitItems}
                              activeSection={activeSection}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul
                    className={cn(
                      'grid grid-cols-1 gap-0.5',
                      { 'gap-2': navItem.items?.find(item => 'description' in item && item.description) },
                      navItem.contentClassName
                    )}
                  >
                    {navItem.items?.map((item, index) => (
                      <ListItem
                        key={index}
                        icon={item.icon}
                        title={flowText(item.title)}
                        description={flowText(item.description)}
                        href={item.href}
                        badge={item.badge}
                        activeSection={activeSection}
                        pathname={pathname}
                      />
                    ))}
                  </ul>
                )}
              </NavigationMenuContent>
            </NavigationMenuItem>
          )
        })}
      </NavigationMenuList>
    </NavigationMenu>
  )
}

const HeaderNavigationSmallScreen = ({
  navigationData,
  triggerClassName,
  screenSize = 1023
}: {
  navigationData: Navigation[]
  triggerClassName?: string
  screenSize?: number
}) => {
  const [open, setOpen] = useState(false)
  const isMobile = useMedia(`(max-width: ${screenSize}px)`, false)

  const pathname = usePathname()

  // Extract all section IDs from navigation data
  const sectionIds = navigationData.flatMap(navItem => {
    if (navItem.href) {
      const id = navItem.href.startsWith('/#')
        ? navItem.href.slice(2)
        : navItem.href.startsWith('#')
          ? navItem.href.slice(1)
          : ''

      return id ? [id] : []
    }

    if (navItem.items) {
      if (navItem.splitItems) {
        return navItem.items.flatMap(section =>
          section.items
            .map(item => {
              const id = item.href.startsWith('/#')
                ? item.href.slice(2)
                : item.href.startsWith('#')
                  ? item.href.slice(1)
                  : ''

              return id
            })
            .filter(Boolean)
        )
      }

      return navItem.items
        .map(item => {
          const id = item.href.startsWith('/#')
            ? item.href.slice(2)
            : item.href.startsWith('#')
              ? item.href.slice(1)
              : ''

          return id
        })
        .filter(Boolean)
    }

    return []
  })

  const activeSection = useActiveSection(sectionIds)

  const handleLinkClick = () => {
    setOpen(false)
  }

  useEffect(() => {
    if (!isMobile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false)
    }
  }, [isMobile])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <SecondaryFlowButton className={cn('inline-flex lg:hidden', triggerClassName)}>
          <MenuIcon />
          <span className='sr-only'><FlowCopy text="Menu" /></span>
        </SecondaryFlowButton>
      </SheetTrigger>
      <SheetContent side='left' className='w-75 gap-0 p-0'>
        <SheetHeader className='p-4'>
          <SheetTitle hidden />
          <SheetDescription hidden />
          <Link href='/projects' onClick={handleLinkClick} className='self-start'>
            <Logo />
          </Link>
        </SheetHeader>
        <div className='space-y-0.5 overflow-y-auto p-2'>
          {navigationData.map((navItem, index) => {
            if (navItem.href) {
              const sectionId = navItem.href.startsWith('/#')
                ? navItem.href.slice(2)
                : navItem.href.startsWith('#')
                  ? navItem.href.slice(1)
                  : ''

              const isActive = sectionId ? activeSection === sectionId : pathname?.startsWith(navItem.href)

              return (
                <Link
                  key={flowText(navItem.title)}
                  href={navItem.href}
                  data-active={isActive}
                  className='hover:bg-accent data-[active=true]:bg-accent flex items-center gap-2 rounded-sm px-3 py-2 text-sm data-[active=true]:font-medium'
                  onClick={handleLinkClick}
                >
                  {flowText(navItem.title)}
                </Link>
              )
            }

            // Check if any child item is active
            let hasActiveChild = false

            if (navItem.items) {
              if (navItem.splitItems) {
                hasActiveChild = navItem.items.some(section =>
                  section.items.some(item => {
                    const id = item.href.startsWith('/#')
                      ? item.href.slice(2)
                      : item.href.startsWith('#')
                        ? item.href.slice(1)
                        : ''

                    return id && activeSection === id
                  })
                )
              } else {
                hasActiveChild = navItem.items.some(item => {
                  const id = item.href.startsWith('/#')
                    ? item.href.slice(2)
                    : item.href.startsWith('#')
                      ? item.href.slice(1)
                      : ''

                  return id && activeSection === id
                })
              }
            }

            return (
              <Collapsible key={index} className='w-full'>
                <CollapsibleTrigger
                  data-active={hasActiveChild}
                  className='hover:bg-accent group data-[active=true]:bg-accent flex w-full items-center justify-between rounded-sm px-3 py-2 text-sm data-[active=true]:font-medium'
                >
                  <div className='flex items-center gap-2'>{flowText(navItem.title)}</div>
                  <ChevronRightIcon className='size-4 shrink-0 transition-transform duration-300 group-data-[state=open]:rotate-90' />
                </CollapsibleTrigger>
                <CollapsibleContent className='data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden transition-all duration-300'>
                  {navItem.splitItems
                    ? navItem.items.map((item, i) => (
                        <div key={i} className='mt-1.5'>
                          <div className='text-muted-foreground mb-1 pl-4.5 text-xs font-medium'>{flowText(item.title)}</div>
                          {item.items.map((subItem, j) => {
                            const sectionId = subItem.href.startsWith('/#')
                              ? subItem.href.slice(2)
                              : subItem.href.startsWith('#')
                                ? subItem.href.slice(1)
                                : ''

                            const isActive = sectionId
                              ? activeSection === sectionId
                              : pathname?.startsWith(subItem.href)

                            return (
                              <Link
                                key={j}
                                href={subItem.href}
                                data-active={isActive}
                                className='hover:bg-accent data-[active=true]:text-primary ml-4.5 flex items-center gap-2 rounded-sm px-3 py-2 text-sm data-[active=true]:font-medium'
                                onClick={handleLinkClick}
                              >
                                {subItem.icon ? subItem.icon : <CircleSmallIcon className='size-4' />}
                                {flowText(subItem.title)}
                              </Link>
                            )
                          })}
                        </div>
                      ))
                    : navItem.items?.map(item => {
                        const sectionId = item.href.startsWith('/#')
                          ? item.href.slice(2)
                          : item.href.startsWith('#')
                            ? item.href.slice(1)
                            : ''

                        const isActive = sectionId ? activeSection === sectionId : pathname?.startsWith(item.href)

                        return (
                          <Link
                            key={flowText(item.title)}
                            href={item.href}
                            data-active={isActive}
                            className='hover:bg-accent data-[active=true]:text-primary ml-3 flex items-center gap-2 rounded-sm px-3 py-2 text-sm data-[active=true]:font-medium'
                            onClick={handleLinkClick}
                          >
                            {item.icon ? item.icon : <CircleSmallIcon className='size-4' />}
                            {flowText(item.title)}
                          </Link>
                        )
                      })}
                </CollapsibleContent>
              </Collapsible>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { HeaderNavigation, HeaderNavigationSmallScreen, type Navigation, type NavigationItem, type NavigationSection }
