'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

/* ── common list envelope ────────────────────────────────────────────── */

export interface ListEnvelope<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/* ── dashboard ───────────────────────────────────────────────────────── */

export interface DashboardData {
  metrics: {
    clients: number;
    engagements: number;
    documents: number;
    runs: number;
    openExceptions: number;
    myOpenExceptions: number;
    queuedRuns: number;
  };
  severityBuckets: Record<string, number>;
  recentRuns: {
    id: string;
    type: string;
    status: string;
    progress: number;
    client: string;
    engagement: string;
    createdAt: string;
    metrics: unknown;
  }[];
  recentExceptions: {
    id: string;
    severity: string;
    status: string;
    title: string;
    client: string;
    engagement: string;
    kind: string;
  }[];
  role: string;
  isPartnerOrAdmin: boolean;
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  });
}

/* ── clients ─────────────────────────────────────────────────────────── */

export interface Client {
  id: string;
  name: string;
  type: string;
  gstin: string | null;
  pan: string | null;
  tan: string | null;
  cin: string | null;
  status: string;
  tags: string[];
  engagementsCount?: number;
  documentsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export function useClients(params?: { search?: string; status?: string; filter?: string }) {
  const q = new URLSearchParams();
  if (params?.search) q.set('search', params.search);
  if (params?.status) q.set('status', params.status);
  if (params?.filter && params.filter !== 'all') q.set('filter', params.filter);
  const qs = q.toString();
  return useQuery({
    queryKey: ['clients', qs],
    queryFn: () => api.get<ListEnvelope<Client>>(`/clients${qs ? `?${qs}` : ''}`),
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['client', id],
    queryFn: () => api.get<Client & { engagements: Engagement[] }>(`/clients/${id}`),
    enabled: Boolean(id),
  });
}

/* ── engagements ─────────────────────────────────────────────────────── */

export interface Engagement {
  id: string;
  clientId: string;
  client?:
    | {
        id: string;
        name: string;
        type?: string;
        gstin?: string | null;
        pan?: string | null;
        tan?: string | null;
        address?: string | null;
      }
    | null;
  title: string;
  kind: string;
  status: string;
  financialYear: { start: string; end: string };
  conclusion: string | null;
  progressPercent?: number;
  metrics?: Record<string, number>;
  team?: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
  _count?: { documents: number; runs: number; workingPapers: number; exceptions?: number; members?: number };
  /* engagement detail only */
  summary?: { completed: number; totalMatched: number; totalUnmatched: number };
  checklist?: { key: string; label: string; done: boolean }[];
  documents?: {
    id: string;
    category: string | null;
    originalName: string;
    status: string;
    mime: string;
    recordCount: number | null;
    createdAt: string;
  }[];
  runs?: {
    id: string;
    type: string;
    status: string;
    progress: number;
    metrics: Record<string, number> | null;
    createdAt: string;
  }[];
  workingPapers?: { id: string; title: string; status: string; updatedAt?: string }[];
  members?: { id: string; user?: { id: string; name: string; email: string } }[];
}

export function useEngagements(params?: { search?: string; status?: string; clientId?: string }) {
  const q = new URLSearchParams();
  if (params?.search) q.set('search', params.search);
  if (params?.status) q.set('status', params.status);
  if (params?.clientId) q.set('clientId', params.clientId);
  const qs = q.toString();
  return useQuery({
    queryKey: ['engagements', qs],
    queryFn: () => api.get<ListEnvelope<Engagement>>(`/engagements${qs ? `?${qs}` : ''}`),
  });
}

export function useEngagement(id: string) {
  return useQuery({
    queryKey: ['engagement', id],
    queryFn: () => api.get<Engagement>(`/engagements/${id}`),
    enabled: Boolean(id),
  });
}

/* ── reconciliation runs ─────────────────────────────────────────────── */

export interface RunSource {
  id: string;
  originalName: string;
  category: string | null;
}

export interface TaxMetrics {
  matched: { count: number; tds: number; gross: number };
  amountDiff: { count: number; tds: number; variance: number };
  incomeMismatch: { count: number; tds: number; grossDiff: number };
  sectionMismatch: { count: number; tds: number };
  missingInBooks: { count: number; tds: number };
  missingIn26AS: { count: number; tds: number };
  duplicates: { count: number; tds: number };
  highRisk: { count: number; tds: number };
  tds26: number;
  tdsBooks: number;
  netDiff: number;
  pairs: number;
  matchRate: number;
  taxCreditLoss: number;
  thresholds: { tdsTolerance: number; matchGate: number; highRiskTds: number };
}

export interface ReconRun {
  id: string;
  type: string;
  status: string;
  progress: number;
  clientId: string;
  engagementId: string;
  client?: { id: string; name: string; gstin?: string | null; pan?: string | null } | null;
  engagement?: { id: string; title: string; status?: string } | null;
  metrics?: Record<string, unknown> & {
    matchedCount?: number;
    unmatchedCount?: number;
    byStatus?: Record<string, number>;
    totalA?: number;
    totalB?: number;
    sectionSummary?: Array<Record<string, unknown>>;
    deductorSummary?: Array<Record<string, unknown>>;
    tax?: TaxMetrics;
  };
  sourceA?: RunSource | null;
  sourceB?: RunSource | null;
  aisSource?: RunSource | null;
  statusCounts?: Record<string, number>;
  itemTotal?: number;
  page?: number;
  pageSize?: number;
  items?: ReconItem[];
  createdAt: string;
  updatedAt?: string;
}

export interface ReconItem {
  id: string;
  recordAId: string | null;
  recordBId: string | null;
  matchStatus: string;
  score: number;
  matchedBy: string | null;
  reasons: string[];
  amountPaiseA: number | null;
  amountPaiseB: number | null;
  variancePaise: number | null;
  recordA?: { id: string; data: Record<string, unknown> } | null;
  recordB?: { id: string; data: Record<string, unknown> } | null;
}

export function useRuns(params?: { engagementId?: string; status?: string }) {
  const q = new URLSearchParams();
  if (params?.engagementId) q.set('engagementId', params.engagementId);
  if (params?.status) q.set('status', params.status);
  const qs = q.toString();
  return useQuery({
    queryKey: ['runs', qs],
    queryFn: () => api.get<ListEnvelope<ReconRun>>(`/reconciliations${qs ? `?${qs}` : ''}`),
  });
}

export function useRun(id: string, params?: { status?: string; side?: string; matched?: boolean; highRisk?: boolean; page?: number }) {
  const q = new URLSearchParams();
  if (params?.status && params.status !== 'all') q.set('status', params.status);
  if (params?.side && params.side !== 'all') q.set('side', params.side);
  if (params?.matched) q.set('matched', 'true');
  if (params?.highRisk) q.set('highRisk', 'true');
  if (params?.page && params.page > 1) q.set('page', String(params.page));
  const qs = q.toString();
  return useQuery({
    queryKey: ['run', id, qs],
    queryFn: () => api.get<ReconRun>(`/reconciliations/${id}${qs ? `?${qs}` : ''}`),
    enabled: Boolean(id),
  });
}

/* ── TB / P&L variance runs ─────────────────────────────────────────── */

export interface VarianceRun {
  id: string;
  status: string;
  progress: number;
  clientId: string;
  engagementId: string;
  config: Record<string, unknown> | null;
  priorDocId: string | null;
  currentDocId: string | null;
  metrics: Record<string, number> | null;
  error: string | null;
  client?: { id: string; name: string; gstin?: string | null; pan?: string | null } | null;
  engagement?: { id: string; title: string; status?: string } | null;
  priorDoc?: { id: string; originalName: string; category: string | null } | null;
  currentDoc?: { id: string; originalName: string; category: string | null } | null;
  statusCounts?: Record<string, number>;
  _count?: { results: number; exceptions: number };
  createdAt: string;
  updatedAt?: string;
}

export interface VarianceResult {
  id: string;
  runId: string;
  particulars: string;
  category: string;
  priorClosing: number | null;
  currentClosing: number | null;
  variance: number | null;
  varPct: number | null;
  obMismatch: number | null;
  priorRecord?: { id: string; documentId: string; rowIndex: number | null } | null;
  currentRecord?: { id: string; documentId: string; rowIndex: number | null } | null;
}

export function useVarianceRuns(params?: { engagementId?: string }) {
  const q = new URLSearchParams();
  if (params?.engagementId) q.set('engagementId', params.engagementId);
  const qs = q.toString();
  return useQuery({
    queryKey: ['varianceRuns', qs],
    queryFn: () => api.get<ListEnvelope<VarianceRun>>(`/variance${qs ? `?${qs}` : ''}`),
  });
}

export function useVarianceRun(id: string) {
  return useQuery({
    queryKey: ['varianceRun', id],
    queryFn: () => api.get<VarianceRun>(`/variance/${id}`),
    enabled: Boolean(id),
  });
}

export function useVarianceResults(runId: string, params?: { category?: string; page?: number; obMismatch?: boolean }) {
  const q = new URLSearchParams();
  if (params?.category && params.category !== 'all') q.set('category', params.category);
  if (params?.page && params.page > 1) q.set('page', String(params.page));
  if (params?.obMismatch) q.set('obMismatch', 'true');
  const qs = q.toString();
  return useQuery({
    queryKey: ['varianceResults', runId, qs],
    queryFn: () => api.get<{ items: VarianceResult[]; total: number; page: number; pageSize: number }>(`/variance/${runId}/results${qs ? `?${qs}` : ''}`),
    enabled: Boolean(runId),
  });
}

export function useCreateVarianceRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      engagementId: string;
      clientId: string;
      priorDocumentId?: string;
      currentDocumentId?: string;
      config?: Record<string, unknown>;
    }) => api.post<VarianceRun>('/variance', body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['varianceRuns'] });
      if (vars.engagementId) void qc.invalidateQueries({ queryKey: ['engagement', vars.engagementId] });
    },
  });
}

/* ── TDS compliance checklist ───────────────────────────────────────── */

export interface TdsRun {
  id: string;
  status: string;
  progress: number;
  clientId: string;
  engagementId: string;
  config: { financialYear?: { from?: number; to?: number }; clientName?: string } | null;
  payableDocId: string | null;
  metrics: {
    summary: Record<string, number>;
    sectionSummary: Array<Record<string, unknown>>;
    monthReconMeta: Record<string, number>;
  } | null;
  error: string | null;
  client?: { id: string; name: string; gstin?: string | null; pan?: string | null } | null;
  engagement?: { id: string; title: string; status?: string } | null;
  ledgers?: Array<{ id: string; name: string; section: string; documentId: string; document?: { originalName: string; category: string | null } }>;
  payableDoc?: { id: string; originalName: string; category: string | null } | null;
  dedCounts?: Record<string, number>;
  depCounts?: Record<string, number>;
  _count?: { results: number; exceptions: number };
  createdAt: string;
  updatedAt?: string;
}

export interface TdsResult {
  id: string;
  runId: string;
  ledgerId: string | null;
  sourceRecordId: string | null;
  section: string;
  sectionKey: string;
  sectionName: string;
  party: string;
  partyType: string;
  date: string | null;
  voucher: string | null;
  narration: string | null;
  gross: number;
  cumulative: number;
  rate: number;
  tdsReq: number;
  tdsDed: number;
  diff: number;
  dedStatus: string;
  dedKey: string;
  remark: string | null;
  quarter: string | null;
  due: string | null;
  depDate: string | null;
  depAmt: number;
  depStatus: string;
  daysLate: number | null;
  interest: number;
  sourceRecord?: { id: string; documentId: string; rowIndex: number | null } | null;
  ledger?: { id: string; name: string; section: string; documentId: string } | null;
}

export function useTdsRuns(params?: { engagementId?: string; clientId?: string }) {
  const q = new URLSearchParams();
  if (params?.engagementId) q.set('engagementId', params.engagementId);
  if (params?.clientId) q.set('clientId', params.clientId);
  const qs = q.toString();
  return useQuery({
    queryKey: ['tdsRuns', qs],
    queryFn: () => api.get<ListEnvelope<TdsRun>>(`/tds${qs ? `?${qs}` : ''}`),
  });
}

export function useTdsRun(id: string) {
  return useQuery({
    queryKey: ['tdsRun', id],
    queryFn: () => api.get<TdsRun>(`/tds/${id}`),
    enabled: Boolean(id),
  });
}

export function useTdsResults(runId: string, params?: { dedKey?: string; section?: string; page?: number }) {
  const q = new URLSearchParams();
  if (params?.dedKey && params.dedKey !== 'all') q.set('dedKey', params.dedKey);
  if (params?.section && params.section !== 'all') q.set('section', params.section);
  if (params?.page && params.page > 1) q.set('page', String(params.page));
  const qs = q.toString();
  return useQuery({
    queryKey: ['tdsResults', runId, qs],
    queryFn: () => api.get<{ items: TdsResult[]; total: number; page: number; pageSize: number }>(`/tds/${runId}/results${qs ? `?${qs}` : ''}`),
    enabled: Boolean(runId),
  });
}

export function useTdsMonths(runId: string) {
  return useQuery({
    queryKey: ['tdsMonths', runId],
    queryFn: () => api.get<{ monthRecon: Array<Record<string, unknown>>; monthReconMeta: Record<string, number>; sectionSummary: Array<Record<string, unknown>> }>(`/tds/${runId}/months`),
    enabled: Boolean(runId),
  });
}

export function useCreateTdsRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      engagementId: string;
      clientId: string;
      ledgers: Array<{ documentId: string; name: string; section: string; tdsCol?: string; amountCol?: string }>;
      payableDocumentId?: string;
      config?: { financialYear?: { from?: number; to?: number }; clientName?: string };
    }) => api.post<TdsRun>('/tds', body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['tdsRuns'] });
      if (vars.engagementId) void qc.invalidateQueries({ queryKey: ['engagement', vars.engagementId] });
    },
  });
}

/* ── documents / upload ──────────────────────────────────────────────── */

export interface Document {
  id: string;
  fileName: string;
  originalName: string;
  mime: string;
  category: string | null;
  status: string;
  pageCount: number | null;
  recordCount: number | null;
  failureReason: string | null;
  sha256: string | null;
  uploadedById: string | null;
  createdAt: string;
  client?: { id: string; name: string } | null;
  engagement?: { id: string; title: string } | null;
}

export function useDocuments(params?: { engagementId?: string }) {
  const qs = params?.engagementId ? `?engagementId=${params.engagementId}` : '';
  return useQuery({
    queryKey: ['documents', qs],
    queryFn: () => api.get<ListEnvelope<Document>>(`/documents${qs}`),
  });
}

/* ── exceptions ──────────────────────────────────────────────────────── */

export interface Exception {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  kind: string;
  clientId: string;
  engagementId: string;
  runId?: string | null;
  assigneeId: string | null;
  assignee?: { id: string; name: string; email: string } | null;
  riskTags?: string[];
  resolution?: string | null;
  createdById?: string | null;
  resolvedById?: string | null;
  resolvedAt?: string | null;
  references?: unknown;
  client?: { id: string; name: string } | null;
  engagement?: { id: string; title: string; status?: string } | null;
  run?: { id: string; type: string; status?: string } | null;
  createdAt: string;
  updatedAt: string;
  _count?: { comments: number; evidence: number };
}

export interface ExceptionComment {
  id: string;
  text: string;
  userId: string;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
}

export interface ExceptionActivity {
  id: string;
  action: string;
  userId: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  detail?: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
}

export interface ExceptionEvidence {
  id: string;
  kind: string;
  text?: string | null;
  documentId?: string | null;
  uploadedAt: string;
}

export function useExceptions(params?: { severity?: string; status?: string; engagementId?: string; assignedToMe?: boolean }) {
  const q = new URLSearchParams();
  if (params?.severity) q.set('severity', params.severity);
  if (params?.status) q.set('status', params.status);
  if (params?.engagementId) q.set('engagementId', params.engagementId);
  if (params?.assignedToMe) q.set('assignedToMe', 'true');
  const qs = q.toString();
  return useQuery({
    queryKey: ['exceptions', qs],
    queryFn: () => api.get<ListEnvelope<Exception>>(`/exceptions${qs ? `?${qs}` : ''}`),
  });
}

export function useException(id: string) {
  return useQuery({
    queryKey: ['exception', id],
    queryFn: () =>
      api.get<Exception & { comments: ExceptionComment[]; activities: ExceptionActivity[]; evidence: ExceptionEvidence[] }>(
        `/exceptions/${id}`,
      ),
    enabled: Boolean(id),
  });
}

/* ── working papers ──────────────────────────────────────────────────── */

export interface WorkingPaper {
  id: string;
  title: string;
  deliverable?: string;
  docKey?: string;
  status: string;
  engagementId: string;
  clientId?: string;
  client?: { id: string; name: string; gstin?: string | null; pan?: string | null } | null;
  engagement?: { id: string; title: string; status?: string } | null;
  procedures?: unknown;
  conclusion?: string | null;
  reviewerNote?: string | null;
  runId?: string | null;
  run?: { id: string; type: string; status?: string; metrics?: unknown } | null;
  reports?: { id: string; format: string; createdAt: string }[];
  evidenceHash?: string | null;
  signedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  _count?: { reports: number };
}

export function useWorkingPapers(params?: { engagementId?: string; status?: string }) {
  const q = new URLSearchParams();
  if (params?.engagementId) q.set('engagementId', params.engagementId);
  if (params?.status) q.set('status', params.status);
  const qs = q.toString();
  return useQuery({
    queryKey: ['workingPapers', qs],
    queryFn: () => api.get<ListEnvelope<WorkingPaper>>(`/working-papers${qs ? `?${qs}` : ''}`),
  });
}

export function useWorkingPaper(id: string) {
  return useQuery({
    queryKey: ['workingPaper', id],
    queryFn: () => api.get<WorkingPaper>(`/working-papers/${id}`),
    enabled: Boolean(id),
  });
}

/* ── reports ─────────────────────────────────────────────────────────── */

export interface Report {
  id: string;
  engagementId?: string;
  workingPaperId?: string | null;
  format: string;
  storagePath: string;
  size?: string | number | null;
  generatedById?: string | null;
  createdAt: string;
  engagement?: { id: string; title: string } | null;
  workingPaper?: { id: string; title: string; status: string } | null;
}

export function useReports(params?: { engagementId?: string }) {
  const qs = params?.engagementId ? `?engagementId=${params.engagementId}` : '';
  return useQuery({
    queryKey: ['reports', qs],
    queryFn: () => api.get<ListEnvelope<Report>>(`/reports${qs}`),
  });
}

/* ── team ────────────────────────────────────────────────────────────── */

export interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  lastLoginAt: string | null;
  isActive: boolean;
}

export function useTeam() {
  return useQuery({
    queryKey: ['team'],
    queryFn: () => api.get<{ items: TeamMember[] }>('/auth/team'),
  });
}

/* ── mutations ───────────────────────────────────────────────────────── */

export function useInvalidate(keys: string[]) {
  const qc = useQueryClient();
  return () => {
    for (const k of keys) void qc.invalidateQueries({ queryKey: [k] });
  };
}

export function useCreateClient() {
  const inv = useInvalidate(['clients']);
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post<Client>('/clients', data),
    onSuccess: inv,
  });
}

export function useCreateEngagement() {
  const inv = useInvalidate(['engagements']);
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post<Engagement>('/engagements', data),
    onSuccess: inv,
  });
}

/* ── risk analysis ──────────────────────────────────────────────── */

export interface RiskFinding {
  rule: string;
  score: number;
  reason: string;
  riskLevel: string;
}

export interface RiskAnalysisRun {
  id: string;
  type: string;
  status: string;
  engagementId: string;
  clientId: string;
  metrics: {
    total: number;
    flagged: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    ruleCounts: Record<string, number>;
  } | null;
  client?: { id: string; name: string } | null;
  engagement?: { id: string; title: string } | null;
  createdAt: string;
}

export function useRiskRuns(params?: { engagementId?: string; type?: string; status?: string }) {
  const q = new URLSearchParams();
  if (params?.engagementId) q.set('engagementId', params.engagementId);
  if (params?.type) q.set('type', params.type);
  if (params?.status) q.set('status', params.status);
  const qs = q.toString();
  return useQuery({
    queryKey: ['riskRuns', qs],
    queryFn: () => api.get<ListEnvelope<RiskAnalysisRun>>(`/risk${qs ? `?${qs}` : ''}`),
  });
}

export function useRiskRun(id: string) {
  return useQuery({
    queryKey: ['riskRun', id],
    queryFn: () => api.get<RiskAnalysisRun>(`/risk/${id}`),
    enabled: Boolean(id),
  });
}

export function useRunRiskAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      engagementId: string;
      clientId: string;
      type: string;
      config?: Record<string, unknown>;
    }) => api.post<RiskAnalysisRun>('/risk/analyze', body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['riskRuns'] });
      if (vars.engagementId) void qc.invalidateQueries({ queryKey: ['engagement', vars.engagementId] });
    },
  });
}

/* ── AI suggestions ────────────────────────────────────────────── */

export function useAiClassify() {
  return useMutation({
    mutationFn: (body: { documentId: string; sampleRows?: Record<string, unknown>[] }) =>
      api.post<{ classification: string; confidence: number; reason: string }>('/ai/classify', body),
  });
}

export function useAiColumnMapping() {
  return useMutation({
    mutationFn: (body: { documentId: string; targetColumns: string[] }) =>
      api.post<{ mappings: Record<string, string>; confidence: number }>('/ai/column-mapping', body),
  });
}

export function useAiExplainRisk() {
  return useMutation({
    mutationFn: (body: { rule: string; record: Record<string, unknown>; context?: Record<string, unknown> }) =>
      api.post<{ explanation: string; suggestions: string[] }>('/ai/explain-risk', body),
  });
}

export function useAiDraftWorkingPaper() {
  return useMutation({
    mutationFn: (body: { engagementId: string; workingPaperId?: string; runId?: string; sections?: string[] }) =>
      api.post<{ draft: string; sections: Record<string, string> }>('/ai/draft-working-paper', body),
  });
}

export { ApiError };