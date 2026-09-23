/** TDS section master (mirrors the engine's tds_checklist.SECTIONS). */
export const TDS_SECTIONS: Array<{ key: string; label: string; desc: string }> = [
  { key: '194I_land', label: '194I(a) Rent — Land/Building', desc: '10% · ₹2.4L threshold' },
  { key: '194I_plant', label: '194I(b) Rent — Plant/Machinery', desc: '2% · ₹2.4L threshold' },
  { key: '194J_prof', label: '194J Professional Fees', desc: '10% · ₹30k threshold' },
  { key: '194J_tech', label: '194J Technical Services', desc: '2% · ₹30k threshold' },
  { key: '194C', label: '194C Contractor', desc: '1%/2% by party type · ₹30k threshold' },
  { key: '194H', label: '194H Commission/Brokerage', desc: '5% · ₹15k threshold' },
  { key: '194A', label: '194A Interest', desc: '10% · ₹40k threshold' },
  { key: '194D', label: '194D Insurance Commission', desc: '5% · ₹15k threshold' },
  { key: '194Q', label: '194Q Purchase of Goods', desc: '0.1% · ₹50L threshold' },
];

export const TDS_SECTION_LABEL: Record<string, string> = Object.fromEntries(
  TDS_SECTIONS.map((s) => [s.key, s.label]),
);

export const DED_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  not_deducted: { label: 'Not Deducted', tone: 'danger' },
  short_deduction: { label: 'Short Deduction', tone: 'warning' },
  excess_deduction: { label: 'Excess Deduction', tone: 'cyan' },
  below_threshold: { label: 'Below Threshold', tone: 'dim' },
  compliant: { label: 'Compliant', tone: 'mint' },
};

export const DED_STATUS_TONE: Record<string, 'danger' | 'warning' | 'cyan' | 'dim' | 'mint'> = {
  not_deducted: 'danger',
  short_deduction: 'warning',
  excess_deduction: 'cyan',
  below_threshold: 'dim',
  compliant: 'mint',
};

export const DEP_STATUS_TONE: Record<string, 'mint' | 'warning' | 'danger' | 'dim'> = {
  'DEPOSITED ON TIME': 'mint',
  'LATE DEPOSIT': 'warning',
  'PARTIALLY DEPOSITED': 'warning',
  'NOT DEPOSITED': 'danger',
  'NO DEPOSIT DATA': 'dim',
};