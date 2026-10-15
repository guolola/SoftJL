// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';
import { Avatar, AvatarFallback, AvatarImage } from '@/features/marketing-site/template/components/ui/avatar'
import { Card, CardContent, CardDescription, CardTitle } from '@/features/marketing-site/template/components/ui/card'

import { Rating } from '@/features/marketing-site/template/components/ui/rating'

export type TestimonialItem = {
  name: string
  username: string
  avatar: React.ReactNode
  content: React.ReactNode
  rating: number
}

const TestimonialCard = ({ testimonial }: { testimonial: TestimonialItem }) => {
  return (
    <Card className='h-full max-w-sm justify-between shadow-lg'>
      <CardContent>
        <p className='text-muted-foreground text-base'>{testimonial.content}</p>
      </CardContent>
      <CardContent className='flex justify-between gap-3 max-sm:flex-col max-sm:items-stretch'>
        <div className='flex items-center gap-3'>
          <Avatar className='size-12'>
            {typeof testimonial.avatar === 'string' ? <>
              <AvatarImage src={testimonial.avatar} alt={flowText(testimonial.name)} />
              <AvatarFallback className='text-sm'>
                {testimonial.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </> : testimonial.avatar}
          </Avatar>
          <div className='flex flex-col gap-0.5'>
            <CardTitle className='flex items-center gap-1 text-base'>{flowText(testimonial.name)}</CardTitle>
            <CardDescription className='text-base'>{flowText(testimonial.username)}</CardDescription>
          </div>
        </div>
        <div className='flex items-center gap-1'>
          <Rating readOnly variant='yellow' size={24} value={testimonial.rating} precision={0.5} />
        </div>
      </CardContent>
    </Card>
  )
}

export default TestimonialCard
