// Uses the supplied chat animation to illustrate model selection with local, theme-aware diagrams.
'use client'

// React Imports
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ModelCatalogIllustration, UseCaseIllustration } from './intro-illustrations'

// Third-party Imports
import { motion, AnimatePresence } from 'motion/react'

// Component Imports
import { Button } from '@/components/ui/button'

// Util Imports
import { cn } from '@/lib/utils'
import { CheckIcon, CopyIcon, BotIcon } from 'lucide-react'

// Types
interface Message {
  id: number
  text?: string
  image?: string
  sender: 'user' | 'ai'
  type: 'text' | 'image'
}

const chatMessages: Omit<Message, 'id'>[] = [
  { text: 'firstUser', sender: 'user', type: 'text' },
  {
    text: 'firstReply',
    sender: 'ai',
    type: 'text'
  },
  {
    image: 'catalog',
    sender: 'ai',
    type: 'image'
  },
  { text: 'secondUser', sender: 'user', type: 'text' },
  {
    text: 'secondReply',
    sender: 'ai',
    type: 'text'
  },
  {
    image: 'usecase',
    sender: 'ai',
    type: 'image'
  },
  { text: 'thirdUser', sender: 'user', type: 'text' },
  { text: 'thirdReply', sender: 'ai', type: 'text' }
]

const CopyButton = ({ text }: { text: string }) => {
  const { t } = useTranslation()
  // States
  const [copied, setCopied] = useState<boolean>(false)

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)

      return true
    } catch (err) {
      console.error('Failed to copy text: ', err)

      return false
    }
  }

  return (
    <Button
      variant='ghost'
      size='icon'
      className='relative size-5 cursor-pointer rounded-sm'
      aria-label={t(`standardProject.intro.demo.${copied ? 'copied' : 'copy'}`)}
      onClick={() => copyToClipboard(text)}
    >
      <div className={cn('transition-all', copied ? 'scale-100 opacity-100' : 'scale-0 opacity-0')}>
        <CheckIcon aria-hidden={true} className='text-green-500' />
      </div>
      <div className={cn('absolute transition-all', copied ? 'scale-0 opacity-0' : 'scale-100 opacity-100')}>
        <CopyIcon aria-hidden={true} />
      </div>
    </Button>
  )
}

const ChatAnimation = () => {
  const { t } = useTranslation()
  // States
  const [messages, setMessages] = useState<Message[]>([])
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentMessageIndex < chatMessages.length) {
        const newMessage: Message = {
          id: currentMessageIndex,
          ...chatMessages[currentMessageIndex]
        }

        setMessages(prev => [...prev, newMessage])

        setCurrentMessageIndex(prev => prev + 1)
      } else {
        setMessages([])
        setCurrentMessageIndex(0)
      }
    }, 1800)

    return () => clearInterval(interval)
  }, [currentMessageIndex])

  const shouldShowAvatar = (message: Message, index: number) => {
    const isFirstMessage = index === 0
    const previousMessage = messages[index - 1]
    const isDifferentFromPrevious = previousMessage && previousMessage.sender !== message.sender

    return isFirstMessage || isDifferentFromPrevious
  }

  return (
    <div className='flex h-full flex-col justify-end space-y-2 overflow-hidden'>
      <AnimatePresence>
        {messages.map((message, index) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            layout
            className={cn('flex gap-2', {
              'origin-bottom-right justify-end': message.sender === 'user',
              'origin-bottom-left justify-start': message.sender === 'ai'
            })}
          >
            {message.sender === 'ai' && (
              <div
                className={cn('shrink-0', {
                  'opacity-100': shouldShowAvatar(message, index),
                  'opacity-0': !shouldShowAvatar(message, index)
                })}
              >
                <span className='bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full'>
                  <BotIcon className='size-3.5' />
                </span>
              </div>
            )}

            {message.type === 'text' ? (
              <div
                className={cn('flex w-full flex-col gap-1', {
                  'items-end': message.sender === 'user',
                  'items-start': message.sender === 'ai'
                })}
              >
                <div
                  className={cn('max-w-[85%] rounded-lg px-3 py-2 text-xs', {
                    'bg-primary text-primary-foreground rounded-br-none': message.sender === 'user',
                    'bg-muted rounded-bl-none': message.sender === 'ai'
                  })}
                >
                  {t(`standardProject.intro.demo.${message.text}`)}
                </div>
                <CopyButton text={t(`standardProject.intro.demo.${message.text}`)} />
              </div>
            ) : (
              <div
                className={cn('max-w-[85%] overflow-hidden rounded-lg', {
                  'rounded-tr-none': message.sender === 'user',
                  'rounded-bl-none': message.sender === 'ai'
                })}
              >
                {message.image === 'catalog' ? <ModelCatalogIllustration /> : <UseCaseIllustration />}
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export default ChatAnimation
