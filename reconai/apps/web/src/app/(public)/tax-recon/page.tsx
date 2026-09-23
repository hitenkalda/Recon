import { ProductPage, type ProductPageContent } from '@/components/marketing/product-page';

const content: ProductPageContent = {
  pill: 'Tax Reconciliation',
  headingA: 'Tax Reconciliation.',
  headingB: 'On Autopilot.',
  subtitle:
    'Reconcile 26AS and AIS data with your ledgers, identify missing or unmatched TDS, and create a clear working trail for review.',
  primaryCta: 'Start Tax Recon',
  secondaryCta: 'Explore Tax Intelligence',
  stats: [
    { label: 'TDS Records', value: '4,821', color: 'bg-cyan-400' },
    { label: 'Matched', value: '97.2%', color: 'bg-emerald-400' },
    { label: 'Unmatched', value: '136', color: 'bg-teal-300' },
    { label: 'TDS Identified', value: '₹18.4L', color: 'bg-sky-400' },
  ],
  sectionHeadingA: 'Turn tax data',
  sectionHeadingB: 'into audit-ready evidence.',
  sectionDescription:
    'ReconAI compares tax-source data with your books and surfaces discrepancies that need attention — while keeping professional judgment at the center.',
  features: [
    {
      title: '26AS / AIS Matching',
      description: 'Compare tax-source records against income and TDS ledgers.',
      icon: 'sync_alt',
    },
    {
      title: 'Deductor Analysis',
      description: 'Review deductions by deductor, TAN and section.',
      icon: 'corporate_fare',
    },
    {
      title: 'Missing TDS Detection',
      description: 'Identify records appearing in one source but missing from the other.',
      icon: 'warning',
    },
    {
      title: 'Tax Working Papers',
      description: 'Preserve reconciliation results, exceptions and supporting evidence.',
      icon: 'description',
    },
  ],
};

export default function TaxReconPage() {
  return <ProductPage content={content} />;
}