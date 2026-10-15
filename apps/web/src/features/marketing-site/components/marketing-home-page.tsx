// Composes the original Flow homepage blocks; the router continues to manage SEO.
import { useTranslation } from 'react-i18next';
import FlowLayout from '../template/flow-layout';
import Hero from '@/features/marketing-site/template/components/blocks/hero-section/platform-hero-section';
import TrustedBrands from '@/features/marketing-site/template/components/blocks/trusted-brands/trusted-brands';
import Features from '@/features/marketing-site/template/components/blocks/features/features';
import Benefits from '@/features/marketing-site/template/components/blocks/benefits/benefits';
import Testimonials from '@/features/marketing-site/template/components/blocks/testimonials/testimonials';
import FAQ from '@/features/marketing-site/template/components/blocks/faq/faq';
import CTA from '@/features/marketing-site/template/components/blocks/cta/cta';
import { logos } from '@/features/marketing-site/template/content/trusted-brands';
import { testimonials } from '@/features/marketing-site/template/content/testimonials';
import { faqItems } from '@/features/marketing-site/template/content/faqs';
import { benefits } from '@/features/marketing-site/template/content/benefits';
import SectionSeparator from '@/features/marketing-site/template/components/section-separator';
export function MarketingHomePage({ onNavigate: _onNavigate }: {
    path?: '/';
    onNavigate: (path: string) => void;
}) {
    const { i18n } = useTranslation();
    return (<FlowLayout key={i18n.resolvedLanguage}>
      <Hero />

      <SectionSeparator />

      <TrustedBrands brandLogos={logos}/>

      <SectionSeparator />

      <Features />

      <SectionSeparator />

      <Benefits featuresList={benefits}/>

      <SectionSeparator />

      <Testimonials testimonials={testimonials}/>

      <SectionSeparator />

      <FAQ faqItems={faqItems}/>

      <CTA />
    </FlowLayout>);
}
