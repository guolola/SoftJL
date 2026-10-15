// Ports checkout-page-02 with a flat dialog surface and purchase guidance in place of the demo card form.
'use client'

import { useId } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Label } from '@/shared/ui/label'
import { Separator } from '@/shared/ui/separator'
import { ClockIcon, BadgePercentIcon, Loader2 } from 'lucide-react'

type PaymentMethod = { id: string; name: string; description: string; icon: ReactNode }
type SummaryRow = { label: string; value: string }
type CheckoutProps = {
  title: ReactNode
  description: ReactNode
  paymentMethods: PaymentMethod[]
  selectedMethod: string
  onMethodChange: (id: string) => void
  methodLabel: string
  summaryRows: SummaryRow[]
  totalLabel: string
  total: string
  infoCards: [{ title: string; description: string }, { title: string; description: string }]
  payLabel: string
  processingLabel: string
  usageGuide: {
    title: string
    steps: { title: string; description: string }[]
    note: string
  }
  creating: boolean
  onPay: () => void
}

const Checkout = ({
  title, description, paymentMethods, selectedMethod, onMethodChange, methodLabel,
  summaryRows, totalLabel, total, infoCards, payLabel, processingLabel,
  usageGuide, creating, onPay,
}: CheckoutProps) => {
  const inputId = useId()
  return (
    <section data-testid='billing-checkout-block' className='bg-background p-6 sm:p-8'>
      <div className='mx-auto max-w-7xl'>
        <div className='space-y-6'>
          <header className='grid gap-1 pr-16'>
            <div className='text-2xl font-semibold'>{title}</div>
            {description}
          </header>
          <div>
            <div className='grid grid-cols-1 gap-12 lg:grid-cols-3'>
              <div className='space-y-6 lg:col-span-2'>
                <div role='radiogroup' aria-label={methodLabel} className='w-full'>
                  <div className='grid grid-cols-1 gap-6 sm:grid-cols-2'>
                    {paymentMethods.map(paymentMethod => (
                      <div
                        key={paymentMethod.id}
                        className='border-input has-[:checked]:border-primary/50 relative flex w-full flex-col gap-3 rounded-xl border p-4 outline-none'
                      >
                        <div className='flex gap-3'>
                          {/* Native radios retain the ZIP interaction with the project's shared Label primitive. */}
                          <input
                            type='radio'
                            name={`${inputId}-payment`}
                            value={paymentMethod.id}
                            id={`${inputId}-${paymentMethod.id}`}
                            aria-describedby={`${inputId}-${paymentMethod.id}-description`}
                            checked={selectedMethod === paymentMethod.id}
                            disabled={creating}
                            onChange={() => onMethodChange(paymentMethod.id)}
                            className='mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring'
                          />
                          <div className='grid grow gap-1'>
                            <Label
                              htmlFor={`${inputId}-${paymentMethod.id}`}
                              className='text-base leading-6 font-semibold after:absolute after:inset-0'
                            >
                              {paymentMethod.name}
                            </Label>
                            <p id={`${inputId}-${paymentMethod.id}-description`} className='text-muted-foreground text-sm'>
                              {paymentMethod.description}
                            </p>
                          </div>
                        </div>
                        <div className='ml-8 flex items-center justify-end'>
                          <div className='h-6 w-auto'>{paymentMethod.icon}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Button type='button' className='w-full' disabled={creating} onClick={onPay}>
                  {creating && <Loader2 className='size-4 animate-spin' />}
                  {creating ? processingLabel : payLabel}
                </Button>
                {/* The original form space now explains the real payment-to-generation workflow. */}
                <section className='border-border space-y-4 border-t pt-6' aria-labelledby={`${inputId}-usage`}>
                  <h3 id={`${inputId}-usage`} className='text-lg font-semibold'>{usageGuide.title}</h3>
                  <ol className='space-y-4'>
                    {usageGuide.steps.map((step, index) => (
                      <li key={step.title} className='flex gap-3'>
                        <span aria-hidden='true' className='bg-muted text-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium'>
                          {index + 1}
                        </span>
                        <div className='space-y-1'>
                          <h4 className='text-sm font-medium'>{step.title}</h4>
                          <p className='text-muted-foreground text-sm leading-6'>{step.description}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <p className='text-muted-foreground text-sm leading-6'>{usageGuide.note}</p>
                </section>
              </div>

              {/* Order Summary & Info */}
              <div className='flex flex-col gap-6'>
                <Card className='bg-muted rounded-md ring-0'>
                  <CardContent className='space-y-4'>
                    {summaryRows.map(row => (
                      <div key={row.label} className='flex items-center justify-between gap-3'>
                        <span className='text-muted-foreground text-base'>{row.label}</span>
                        <span className='text-right text-base font-semibold'>{row.value}</span>
                      </div>
                    ))}
                  </CardContent>
                  <CardContent><Separator /></CardContent>
                  <CardContent className='flex items-center justify-between gap-3'>
                    <span className='text-xl font-semibold'>{totalLabel}</span>
                    <span className='text-xl font-semibold'>{total}</span>
                  </CardContent>
                </Card>

                <div className='bg-muted flex gap-2 rounded-lg px-2.5 py-2'>
                  <ClockIcon className='mt-1 size-5 shrink-0' />
                  <div className='space-y-0.5'>
                    <h3 className='text-lg font-medium'>{infoCards[0].title}</h3>
                    <p className='text-primary/80 text-base'>{infoCards[0].description}</p>
                  </div>
                </div>
                <div className='bg-muted flex gap-2 rounded-lg px-2.5 py-2'>
                  <BadgePercentIcon className='mt-1 size-5 shrink-0' />
                  <div className='space-y-0.5'>
                    <h3 className='text-lg font-medium'>{infoCards[1].title}</h3>
                    <p className='text-primary/80 text-base'>{infoCards[1].description}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Checkout
