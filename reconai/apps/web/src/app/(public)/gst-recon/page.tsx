import { ProductPage, type ProductPageContent } from '@/components/marketing/product-page';

const content: ProductPageContent = {
  pill: 'GST Reconciliation',
  headingA: 'GST Reconciliation.',
  headingB: 'On Autopilot.',
  subtitle:
    'Automatically reconcile your books with GST data, identify mismatches and duplicates, and send exceptions straight to review.',
  primaryCta: 'Start GST Recon',
  secondaryCta: 'See How It Works',
  stats: [
    { label: 'Invoices Processed', value: '24,891', color: 'bg-cyan-400' },
    { label: 'Matched', value: '94.7%', color: 'bg-emerald-400' },
    { label: 'Exceptions', value: '312', color: 'bg-teal-300' },
    { label: 'Duplicates Found', value: '28', color: 'bg-sky-400' },
  ],
  sectionHeadingA: 'From thousands of invoices',
  sectionHeadingB: 'to a clean reconciliation.',
  sectionDescription:
    'Upload your purchase ledger and GST data. ReconAI matches records, identifies discrepancies, and highlights exactly what needs your attention.',
  features: [
    {
      title: 'Exact Matches',
      description: 'Automatically identify invoices that match across key fields.',
      icon: 'verified',
    },
    {
      title: 'Mismatch Detection',
      description: 'Find differences in invoice numbers, dates, taxable values and taxes.',
      icon: 'error',
    },
    {
      title: 'Duplicate Detection',
      description: 'Detect duplicate invoices before they become a problem.',
      icon: 'filter_list',
    },
    {
      title: 'Exception Management',
      description: 'Assign, investigate and resolve every mismatch with a clear audit trail.',
      icon: 'flag',
    },
  ],
};

export default function GstReconPage() {
  return <ProductPage content={content} />;
}