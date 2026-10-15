// Ports the supplied gift-card-03 ZIP block; only content, controlled selection and shared UI imports are adapted.
'use client'

import type { KeyboardEvent, Ref } from 'react'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { ShoppingCartIcon } from 'lucide-react'

export type GiftCardOption = {
  id: string
  name: string
  description: string
  price: string
  image: string
  imageAlt: string
  previewLabel: string
}

type GiftCardProps = {
  options: GiftCardOption[]
  selectedId: string
  onSelect: (id: string) => void
  onPurchase: () => void
  selectionLabel: string
  previewGroupLabel: string
  purchaseLabel: string
  purchaseButtonRef?: Ref<HTMLButtonElement>
}

const GiftCard = ({
  options, selectedId, onSelect, onPurchase, selectionLabel,
  previewGroupLabel, purchaseLabel, purchaseButtonRef,
}: GiftCardProps) => {
  const selectedCard = options.find(card => card.id === selectedId) ?? options[0]
  if (!selectedCard) return null

  // Gallery and amount controls select the same product; arrow keys follow radio semantics.
  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number
    switch (event.key) {
      case 'ArrowRight': case 'ArrowDown': nextIndex = (index + 1) % options.length; break
      case 'ArrowLeft': case 'ArrowUp': nextIndex = (index - 1 + options.length) % options.length; break
      case 'Home': nextIndex = 0; break
      case 'End': nextIndex = options.length - 1; break
      default: return
    }
    event.preventDefault()
    onSelect(options[nextIndex].id)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]').item(nextIndex)?.focus()
  }

  return (
    <Card as='section' data-testid='billing-account-sku-selector' className='w-full max-w-228.75'>
      <CardContent>
        <div className='grid gap-6 md:grid-cols-2'>
          {/* Left side - Image Gallery */}
          <div className='space-y-2'>
            <div className='bg-muted overflow-hidden rounded-md'>
              <img
                src={selectedCard.image}
                alt={selectedCard.imageAlt}
                className='h-auto w-full md:h-60.5'
              />
            </div>
            <div className='grid grid-cols-4 gap-2' role='group' aria-label={previewGroupLabel}>
              {options.map(card => (
                <button
                  key={card.id}
                  type='button'
                  aria-label={card.previewLabel}
                  aria-pressed={selectedCard.id === card.id}
                  onClick={() => onSelect(card.id)}
                  className={`bg-muted overflow-hidden rounded-sm transition-all focus-visible:ring-2 focus-visible:ring-ring ${
                    selectedCard.id === card.id ? 'outline-primary outline-1' : 'outline-0'
                  }`}
                >
                  <img src={card.image} alt='' className='h-full w-full' />
                </button>
              ))}
            </div>
          </div>

          {/* Right side - Product Details */}
          <div className='flex flex-col justify-between gap-4'>
            <div className='space-y-3'>
              <div aria-live='polite'>
                <h3 className='text-3xl font-semibold'>{selectedCard.name}</h3>
                <p className='text-muted-foreground mt-3 text-base'>{selectedCard.description}</p>
                <p className='mt-3 text-base font-semibold'>{selectedCard.price}</p>
              </div>
              <div className='space-y-2'>
                <h4 className='text-base font-medium'>{selectionLabel}</h4>
                <div className='flex flex-wrap gap-3' role='radiogroup' aria-label={selectionLabel}>
                  {options.map((card, index) => (
                    <Button
                      key={card.id}
                      type='button'
                      role='radio'
                      aria-checked={selectedCard.id === card.id}
                      tabIndex={selectedCard.id === card.id ? 0 : -1}
                      variant={selectedCard.id === card.id ? 'default' : 'secondary'}
                      onClick={() => onSelect(card.id)}
                      onKeyDown={event => handleOptionKeyDown(event, index)}
                      size='sm'
                      className='h-6 rounded-md px-2 text-xs'
                    >
                      {card.name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <Button ref={purchaseButtonRef} type='button' onClick={onPurchase} className='mt-auto w-full text-base font-medium' size='lg'>
              <ShoppingCartIcon className='h-4 w-4' />
              {purchaseLabel}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default GiftCard
