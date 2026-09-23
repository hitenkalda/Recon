import { z } from 'zod';
import { id } from './common.js';

/** Update one recon item's match state (manual match / mismatch override). */
export const reconItemUpdateSchema = z
  .object({
    runId: id,
    itemId: id,
    action: z.enum(['manual_match', 'unmatch', 'apply_ai', 'reject_ai', 'flag_exception']),
    targetItemId: id.optional(), // for manual_match — the counterpart item/record
    note: z.string().max(1000).optional(),
  })
  .strict();

export const exceptionCreateSchema = z
  .object({
    runId: id,
    kind: z.enum([
      'missing_invoice',
      'amount_mismatch',
      'duplicate',
      'unmatched_entry',
      'itc_not_available',
      'itc_blocked',
      'tax_credit_lost',
      'gstin_mismatch',
      'vendor_mismatch',
      'date_mismatch',
      'risk_signal',
      'other',
    ]),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    title: z.string().min(2).max(200),
    description: z.string().max(4000).optional(),
    referenceItemIds: z.array(id).default([]),
  })
  .strict();

export const exceptionUpdateSchema = z
  .object({
    exceptionId: id,
    status: z.enum(['open', 'assigned', 'in_review', 'resolved', 'reopened']).optional(),
    assigneeId: id.optional(),
    comment: z.string().max(2000).optional(),
    evidenceDocumentIds: z.array(id).optional(),
    resolution: z.string().max(4000).optional(),
  })
  .strict();

export const workingPaperCreateSchema = z
  .object({
    engagementId: id,
    clientId: id,
    title: z.string().min(2).max(200),
    deliverable: z.enum(['gst_reconciliation', 'bank_reconciliation', 'ais_reconciliation', 'exception_summary', 'risk_report', 'tax_credit']),
    runId: id.optional(),
    procedures: z.array(z.string()).default([]),
    conclusion: z.string().max(8000).optional(),
  })
  .strict();

export const workingPaperUpdateSchema = z
  .object({
    id,
    title: z.string().min(2).max(200).optional(),
    procedures: z.array(z.string()).optional(),
    conclusion: z.string().max(8000).optional(),
    status: z.enum(['draft', 'ready_for_review', 'senior_signed', 'partner_signed']).optional(),
    reviewerNote: z.string().max(4000).optional(),
  })
  .strict();

export const exportSchema = z
  .object({
    runId: id.optional(),
    exceptionId: id.optional(),
    workingPaperId: id.optional(),
    reportId: id.optional(),
    format: z.enum(['pdf', 'xlsx', 'csv']),
  })
  .strict();

export type ReconItemUpdateInput = z.infer<typeof reconItemUpdateSchema>;
export type ExceptionCreateInput = z.infer<typeof exceptionCreateSchema>;
export type ExceptionUpdateInput = z.infer<typeof exceptionUpdateSchema>;
export type WorkingPaperCreateInput = z.infer<typeof workingPaperCreateSchema>;
export type WorkingPaperUpdateInput = z.infer<typeof workingPaperUpdateSchema>;