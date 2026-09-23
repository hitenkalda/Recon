import { z } from 'zod';
import { id, monthsRange, financialYear } from './common.js';
import { ClientStatus } from '../types/enums.js';

export const clientCreateSchema = z
  .object({
    name: z.string().min(2).max(200),
    type: z.enum(['company', 'llp', 'partnership', 'proprietorship', 'trust', 'individual']),
    gstin: z.string().optional(),
    pan: z.string().optional(),
    tan: z.string().optional(),
    cin: z.string().optional(),
    address: z.string().max(500).optional(),
    contacts: z
      .array(
        z.object({
          name: z.string().min(1).max(120),
          email: z.string().email().max(255).optional(),
          phone: z.string().optional(),
          role: z.string().max(60).optional(),
        }),
      )
      .default([]),
    tags: z.array(z.string().max(40)).default([]),
  })
  .strict();

export const clientUpdateSchema = clientCreateSchema.partial().extend({
  status: z.nativeEnum(ClientStatus).optional(),
});

export const clientQuerySchema = z.object({
  search: z.string().max(120).optional(),
  status: z.nativeEnum(ClientStatus).optional(),
  filter: z.enum(['all', 'active_gst', 'needs_recon', 'tax_audit']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const clientEngagementCreateSchema = z
  .object({
    clientId: id,
    title: z.string().min(2).max(200),
    kind: z.enum(['gst_compliance', 'tax_audit', 'reconciliation', 'management_audit', 'other']),
    financialYear: financialYear,
    scope: z.object({
      months: monthsRange.optional(),
      gstin: z.string().optional(),
      gstr1: z.boolean().default(true),
      gstr2b: z.boolean().default(true),
      gstr3b: z.boolean().default(false),
      bankStatement: z.boolean().default(false),
      ais26as: z.boolean().default(false),
      purchaseLedger: z.boolean().default(false),
      salesLedger: z.boolean().default(false),
      otherForms: z.array(z.string()).default([]),
    }),
    taxBase: z
      .object({
        gstin: z.string().optional(),
        pan: z.string().optional(),
        tan: z.string().optional(),
      })
      .optional(),
    team: z.array(id).default([]),
  })
  .strict();

export const engagementUpdateSchema = z
  .object({
    title: z.string().min(2).max(200).optional(),
    status: z.enum(['draft', 'in_setup', 'in_progress', 'under_review', 'completed', 'archived']).optional(),
    scope: z.record(z.unknown()).optional(),
    taxBase: z.record(z.unknown()).optional(),
    team: z.array(id).optional(),
    conclusion: z.string().max(4000).optional(),
  })
  .strict();

export const engagementQuerySchema = z.object({
  clientId: id.optional(),
  status: z.enum(['draft', 'in_setup', 'in_progress', 'under_review', 'completed', 'archived']).optional(),
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
export type ClientQuery = z.infer<typeof clientQuerySchema>;
export type EngagementCreateInput = z.infer<typeof clientEngagementCreateSchema>;
export type EngagementUpdateInput = z.infer<typeof engagementUpdateSchema>;