import { ProductPage, type ProductPageContent } from '@/components/marketing/product-page';

const content: ProductPageContent = {
  pill: 'Bank Reconciliation',
  headingA: 'Bank Reconciliation.',
  headingB: 'On Autopilot.',
  subtitle:
    'Match bank statements against your books, identify outstanding transactions, and surface unusual entries without manually comparing thousands of rows.',
  primaryCta: 'Start Bank Recon',
  secondaryCta: 'See Reconciliation',
  stats: [
    { label: 'Transactions', value: '18,492', color: 'bg-cyan-400' },
    { label: 'Matched', value: '96.8%', color: 'bg-emerald-400' },
    { label: 'Outstanding', value: '247', color: 'bg-teal-300' },
    { label: 'Risk Flags', value: '34', color: 'bg-sky-400' },
  ],
  sectionHeadingA: 'Stop comparing rows.',
  sectionHeadingB: 'Start reviewing exceptions.',
  sectionDescription:
    'ReconAI matches transactions across dates, amounts, references and counterparties, leaving your team with the items that actually need attention.',
  features: [
    {
      title: 'Automatic Matching',
      description: 'Match bank transactions with ledger entries using configurable rules and tolerances.',
      icon: 'link',
    },
    {
      title: 'Outstanding Items',
      description: 'Clearly identify transactions that exist on one side but not the other.',
      icon: 'inbox',
    },
    {
      title: 'Reference Matching',
      description: 'Use UTRs, cheque numbers, references and descriptions to improve matching.',
      icon: 'receipt_long',
    },
    {
      title: 'Risk Detection',
      description: 'Surface unusual transactions for senior review.',
      icon: 'warning',
    },
  ],
};

export default function BankReconPage() {
  return <ProductPage content={content} />;
}