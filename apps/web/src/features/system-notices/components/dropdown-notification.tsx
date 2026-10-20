// Direct source from dashboard-header-15; imports, data and event handlers are adapted for the platform.
import { Fragment, type ReactElement } from 'react'
import type { InboxMessage, SystemNoticeDto } from '@uml-platform/contracts'
import { useTranslation } from 'react-i18next'
import { Badge } from '../../../shared/ui/badge'
import { Button } from '../../../shared/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '../../../shared/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../shared/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuItem
} from '../../../shared/ui/dropdown-menu'
import { RefreshCwIcon, XIcon, LinkIcon, Loader2, Megaphone } from 'lucide-react'

type Props = {
  trigger: ReactElement
  defaultOpen?: boolean
  align?: 'start' | 'center' | 'end'
  open?: boolean
  onOpenChange?: (open: boolean) => void
  messages: InboxMessage[]
  notices: SystemNoticeDto[]
  unreadCount: number
  loading: boolean
  inboxError: string
  noticeError: string
  busyId: string | null
  onRefresh: () => void
  onMessageAction: (message: InboxMessage, action: 'read' | 'dismiss' | 'accept' | 'decline') => void
  onNoticeSelect: (notice: SystemNoticeDto) => void
  onNoticeDismiss: (notice: SystemNoticeDto) => void
}

const NotificationDropdown = ({
  trigger, defaultOpen, align = 'end', open, onOpenChange, messages, notices,
  unreadCount, loading, inboxError, noticeError, busyId, onRefresh, onMessageAction, onNoticeSelect, onNoticeDismiss
}: Props) => {
  const { t, i18n } = useTranslation()
  const formatTime = (value: string) => new Date(value).toLocaleString(i18n.language, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
  return (
    <DropdownMenu defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent className='w-full max-w-xs sm:max-w-122' style={{ width: 'calc(100vw - 2rem)' }} align={align || 'end'}>
        <Tabs defaultValue='inbox' className='gap-0'>
          <DropdownMenuGroup>
            <DropdownMenuLabel className='flex flex-col pb-0'>
              <div className='flex items-center justify-between gap-6 pb-2.5'>
                <span className='text-muted-foreground text-sm font-normal uppercase'>{t('notices.notifications')}</span>
                <Badge variant='secondary' className='bg-primary/10 text-primary font-normal'>
                  {t('notices.newCount', { count: unreadCount })}
                </Badge>
              </div>
              <div className='-mb-0.5 flex items-center justify-between gap-4'>
                <TabsList variant='line'>
                  <TabsTrigger value='inbox' className='group-data-[orientation=horizontal]/tabs:after:-bottom-1'>
                    {t('notices.inbox')}
                  </TabsTrigger>
                  <TabsTrigger value='general' className='group-data-[orientation=horizontal]/tabs:after:-bottom-1'>
                    {t('notices.general')}
                  </TabsTrigger>
                </TabsList>
                <Button type='button' variant='ghost' size='icon' className='size-auto p-0' aria-label={t('notices.refresh')} disabled={loading} onClick={onRefresh}>
                  <RefreshCwIcon className={`text-foreground size-5${loading ? ' animate-spin motion-reduce:animate-none' : ''}`} />
                </Button>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>

          <DropdownMenuSeparator className='mt-0 h-0.5' />

          <TabsContent value='inbox'>
            {inboxError ? <p role='alert' className='p-4 text-sm text-destructive'>{inboxError}</p>
              : loading && !messages.length ? <div className='flex justify-center p-6'><Loader2 className='size-5 animate-spin' aria-label={t('notices.loading')} /></div>
              : !messages.length ? <p className='p-6 text-center text-sm text-muted-foreground'>{t('notices.inboxEmpty')}</p>
              : messages.map((message, index) => (
                <Fragment key={message.id}>
                  {index > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    className={`${message.status === 'pending' || (message.status === 'accepted' && message.project) ? 'items-start ' : ''}gap-3 px-2 py-3 text-base not-data-[variant=destructive]:focus:**:text-[revert-rule]`}
                    closeOnClick={false}
                    onClick={() => onMessageAction(message, 'read')}
                    data-testid='inbox-message'
                  >
                    <Avatar className='size-9.5'>
                      <AvatarImage src={message.sender?.avatarUrl ?? undefined} alt='' />
                      <AvatarFallback>{(message.sender?.displayName ?? message.sender?.username ?? '?').slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className='flex w-full flex-col items-start'>
                      <span className='text-base font-medium'>
                        {t(message.kind === 'project' ? 'notices.projectInvitation' : 'notices.adminInvitation', {
                          sender: message.sender?.displayName ?? message.sender?.username ?? t('notices.system'),
                          project: message.project?.name,
                          role: t(`notices.adminRoles.${message.role}`, { defaultValue: message.role })
                        })}
                      </span>
                      <div className='flex items-center gap-2.5'>
                        <span className='text-muted-foreground text-sm'>{formatTime(message.createdAt)}</span>
                        <div className='bg-primary/30 size-1.5 rounded-full' />
                        <span className='text-muted-foreground text-sm'>{t(`notices.messageStatus.${message.status}`)}</span>
                      </div>
                      {message.status === 'pending' && (
                        <div className='mt-3 flex items-center gap-4'>
                          <Button variant='secondary' size='sm' disabled={!!busyId} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onMessageAction(message, 'decline') }}>
                            {t('notices.decline')}
                          </Button>
                          <Button className='text-primary-foreground!' size='sm' disabled={!!busyId} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onMessageAction(message, 'accept') }}>
                            {t('notices.accept')}
                          </Button>
                        </div>
                      )}
                      {message.status === 'accepted' && message.project && (
                        <a className='mt-3 flex items-center gap-1.5' href={`/projects/${encodeURIComponent(message.project.id)}`} onClick={event => event.stopPropagation()}>
                          <LinkIcon className='text-foreground' />
                          <span className='text-sm'>{t('notices.openProject')}</span>
                        </a>
                      )}
                    </div>
                    {message.status !== 'pending' && (
                      <div className='flex flex-col items-center gap-3'>
                        <Button type='button' variant='ghost' size='icon' className='size-auto p-0' aria-label={t('notices.dismissMessage', { name: message.project?.name ?? message.sender?.displayName })} disabled={!!busyId} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onMessageAction(message, 'dismiss') }}>
                          <XIcon className='text-foreground size-3.5' />
                        </Button>
                        {message.unread && <div className='bg-primary size-1.5 rounded-full' aria-label={t('notices.unread')} />}
                      </div>
                    )}
                  </DropdownMenuItem>
                </Fragment>
              ))}
          </TabsContent>

          <TabsContent value='general'>
            {noticeError ? <p role='alert' className='p-4 text-sm text-destructive'>{noticeError}</p>
              : loading && !notices.length ? <div className='flex justify-center p-6'><Loader2 className='size-5 animate-spin' aria-label={t('notices.loading')} /></div>
              : !notices.length ? <p className='p-6 text-center text-sm text-muted-foreground'>{t('notices.empty')}</p>
              : notices.map((notice, index) => (
                <Fragment key={notice.id}>
                  {index > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuItem className='gap-3 px-2 py-3 text-base not-data-[variant=destructive]:focus:**:text-[revert-rule]' onClick={() => onNoticeSelect(notice)}>
                    <Avatar className='size-9.5'>
                      <AvatarFallback>{notice.icon || <Megaphone className='size-4' />}</AvatarFallback>
                    </Avatar>
                    <div className='flex w-full flex-col items-start'>
                      <span className='text-base font-medium'>{notice.title}</span>
                      <div className='flex items-center gap-2.5'>
                        <span className='text-muted-foreground text-sm'>{formatTime(notice.publishedAt ?? notice.createdAt)}</span>
                        <div className='bg-primary/30 size-1.5 rounded-full' />
                        <span className='text-muted-foreground text-sm'>{t(`notices.types.${notice.type}`)}</span>
                      </div>
                    </div>
                    <div className='flex flex-col items-center gap-3'>
                      <Button type='button' variant='ghost' size='icon' className='size-auto p-0' aria-label={t('notices.dismissNotice', { name: notice.title })} disabled={!!busyId} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onNoticeDismiss(notice) }}>
                        <XIcon className='text-foreground size-3.5' />
                      </Button>
                      {notice.unread && <div className='bg-primary size-1.5 rounded-full' aria-label={t('notices.unread')} />}
                    </div>
                  </DropdownMenuItem>
                </Fragment>
              ))}
          </TabsContent>
        </Tabs>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default NotificationDropdown
