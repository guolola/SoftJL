import type { ReviewCard } from '@/components/blocks/testimonials/review-stack'

export const reviews: ReviewCard[] = [
  {
    id: '1',
    avatar: '/images/avatar/avatar-1.webp',
    fallback: 'MC',
    name: 'Marley Calzoni',
    designation: 'CEO & Co Founder',
    company: 'Lemonsqueezy',
    rating: 4.5,
    message:
      'Outstanding product—well-crafted, user-friendly, and exactly what I expected. The team went above and beyond to help. Their support was very responsive.'
  },
  {
    id: '2',
    avatar: '/images/avatar/avatar-3.webp',
    fallback: 'TS',
    name: 'Tony Stark',
    designation: 'CEO & Co Founder',
    company: 'Stark Industries',
    rating: 5,
    message:
      'Exceptional service—intuitive, reliable, and exceeded my expectations. The team was incredibly helpful and ensured a seamless integration process.'
  },
  {
    id: '3',
    avatar: '/images/avatar/avatar-5.webp',
    fallback: 'BW',
    name: 'Bruce Wayne',
    designation: 'CEO & Co Founder',
    company: 'Wayne Enterprises',
    rating: 3.5,
    message:
      'Exceptional quality—innovative, dependable, and surpassed all expectations. The team provided excellent guidance and ensured everything worked perfectly.'
  }
]
