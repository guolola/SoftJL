export const aboutData = {
  name: 'John Doe',
  role: 'UI/UX Designer',
  image: '/images/profile/image-01.webp',
  imageAlt: 'John Doe - UI/UX Designer',
  availableForHire: true,
  socialLinks: [
    { icon: 'instagram' as const, url: '#' },
    { icon: 'dribbble' as const, url: '#' },
    { icon: 'linkedin' as const, url: '#' },
    { icon: 'github' as const, url: '#' }
  ],
  signature: '/images/about/image-28.webp',
  signatureDark: '/images/about/image-28-dark.webp',
  aboutContent: {
    paragraphs: [
      "**Design isn't just my job—it's my passion.** What began as a hobby turned into a full-fledged career when I realized the true power of design: not just making things beautiful, but making them work better.",
      '**My approach is all about crafting user interfaces that serve a real purpose.** I believe great design should solve problems and provide seamless experiences.',
      "**I'm a perfectionist when it comes to the details, and I believe it's the little things that elevate design from good to great.** This meticulous attention to detail allows me to create lasting relationships with clients."
    ]
  },
  toolsTitle: 'Tools That Power My Design Process',
  toolsDescription:
    'My design process is powered by tools that encourage clarity, collaboration, and creativity — turning vision into user-centered experiences.',
  tools: [
    {
      name: 'Figma',
      icon: '/images/about/image-19.webp',
      url: 'https://figma.com',
      showName: true
    },
    {
      name: 'Framer',
      icon: '/images/about/image-20.webp',
      darkIcon: '/images/about/image-20-dark.webp',
      url: 'https://framer.com',
      showName: true
    },
    {
      name: 'Blender',
      icon: '/images/about/image-21.webp',
      url: 'https://blender.org',
      showName: true
    },
    {
      name: 'Webflow',
      icon: '/images/about/image-22.webp',
      url: 'https://webflow.com',
      showName: true
    },
    {
      name: 'Notion',
      icon: '/images/about/image-23.webp',
      darkIcon: '/images/about/image-23-dark.webp',
      url: 'https://notion.so',
      showName: true
    },
    {
      name: 'GitHub',
      icon: '/images/about/image-24.webp',
      darkIcon: '/images/about/image-24-dark.webp',
      url: 'https://github.com',
      showName: true
    },
    {
      name: 'Adobe XD',
      icon: '/images/about/image-25.webp',
      url: 'https://adobe.com/products/xd',
      showName: true
    },
    {
      name: 'Miro',
      icon: '/images/about/image-26.webp',
      url: 'https://miro.com',
      showName: true
    },
    {
      name: 'Canva',
      icon: '/images/about/image-27.webp',
      url: 'https://canva.com',
      showName: false
    }
  ]
}
