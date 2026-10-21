// Uses the supplied Shadcn Studio autocomplete-09 demo with registered project invitees.
'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

import { useTranslation } from 'react-i18next'
import type { ProjectInviteeSearchResponse } from '@uml-platform/contracts'
import { platformApi } from '../services/platform-api'
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompleteStatus
} from '../../../shared/ui/autocomplete'
import { Avatar, AvatarFallback, AvatarImage } from '../../../shared/ui/avatar'
import { Label } from '../../../shared/ui/label'
import { LoaderCircleIcon } from 'lucide-react'

type Invitee = ProjectInviteeSearchResponse['users'][number]

const AutocompleteWithAsync = ({
  projectId, id, value: searchValue, onValueChange, disabled, invalid, describedBy
}: {
  projectId: string
  id: string
  value: string
  onValueChange: (value: string) => void
  disabled: boolean
  invalid: boolean
  describedBy?: string
}) => {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<Invitee[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSearchResults([])
    setError(null)
    if (!searchValue.trim() || disabled) {
      setIsLoading(false)
      return undefined
    }

    setIsLoading(true)
    let ignore = false

    async function fetchDevelopers() {
      try {
        const { users } = await platformApi.searchProjectInvitees(projectId, searchValue)
        if (!ignore) setSearchResults(users)
      } catch {
        if (!ignore) {
          setError(t('projectShell.membersUi.search.error'))
          setSearchResults([])
        }
      } finally {
        if (!ignore) setIsLoading(false)
      }
    }

    // Keep the demo's debounce and ignore responses after a newer query or dialog close.
    const timeoutId = setTimeout(fetchDevelopers, 300)
    return () => {
      clearTimeout(timeoutId)
      ignore = true
    }
  }, [searchValue, projectId, disabled, t])

  let status: ReactNode = ''

  if (isLoading) {
    status = (
      <div className='flex items-center gap-2'>
        <LoaderCircleIcon className='size-4 animate-spin' />
        {t('projectShell.membersUi.search.loading')}
      </div>
    )
  } else if (error) {
    status = error
  } else if (searchResults.length === 0 && searchValue) {
    status = t('projectShell.membersUi.search.empty', { query: searchValue })
  } else if (searchResults.length > 0) {
    status = t('projectShell.membersUi.search.found', { count: searchResults.length })
  } else if (!searchValue) {
    status = t('projectShell.membersUi.search.start')
  }

  const shouldRenderPopup = searchValue.trim() !== '' && !disabled

  return (
    <div className='w-full'>
      <Autocomplete
        items={searchResults}
        value={searchValue}
        onValueChange={onValueChange}
        disabled={disabled}
        itemToStringValue={(item: unknown) => (item as Invitee).username}
        filter={null}
      >
        <div className='flex flex-col items-start gap-2'>
          <Label htmlFor={id} className='gap-1'>{t('projectShell.membersUi.usernameLabel')}<span className='text-destructive'>*</span></Label>
          <AutocompleteInput id={id} placeholder={t('projectShell.membersUi.usernamePlaceholder')} required aria-invalid={invalid} aria-describedby={describedBy} className='pr-8' showTrigger showClear />
        </div>
        {shouldRenderPopup && (
          <AutocompleteContent>
            <AutocompleteStatus>{status}</AutocompleteStatus>
            <AutocompleteList>
              {(member: Invitee) => (
                <AutocompleteItem key={member.id} value={member} className='rounded-lg'>
                  <div className='flex items-center gap-2.5 truncate'>
                    <Avatar className='size-9'>
                      <AvatarImage src={member.avatarUrl ?? undefined} alt={member.displayName} />
                      <AvatarFallback>
                        {member.displayName
                          .split(' ')
                          .map(n => n[0])
                          .join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className='min-w-0 flex-1'>
                      <div className='truncate font-medium'>{member.displayName}</div>
                      <div className='text-muted-foreground truncate text-sm'>{member.username}</div>
                    </div>
                  </div>
                </AutocompleteItem>
              )}
            </AutocompleteList>
          </AutocompleteContent>
        )}
      </Autocomplete>
    </div>
  )
}

export default AutocompleteWithAsync
