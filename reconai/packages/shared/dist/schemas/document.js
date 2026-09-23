import { z } from 'zod';
import { id, monthsRange } from './common.js';
import { DocumentCategory, ReconType } from '../types/enums.js';
export const uploadInitSchema = z
    .object({
    engagementId: id,
    clientId: id,
    files: z
        .array(z.object({
        size: z.number().int().positive(),
        mime: z.string().max(120),
        name: z.string().min(1).max(260),
    }))
        .min(1)
        .max(20),
})
    .strict();
export const uploadInitResponse = z.object({
    uploadId: id,
    uploads: z.array(z.object({
        fieldId: id,
        presignedUrl: z.string(),
        headers: z.record(z.string()).optional(),
    })),
});
export const documentConfirmSchema = z
    .object({
    uploadId: id,
    fieldId: id,
    category: z.nativeEnum(DocumentCategory).optional(),
})
    .strict();
/** Full re-processing of an existing document. */
export const reprocessSchema = z
    .object({
    documentId: id,
})
    .strict();
export const documentQuerySchema = z.object({
    engagementId: id.optional(),
    clientId: id.optional(),
    category: z.nativeEnum(DocumentCategory).optional(),
    status: z.string().optional(),
    search: z.string().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export const columnMappingSchema = z
    .object({
    documentId: id,
    mappings: z
        .array(z.object({
        sourceColumn: z.string().min(1).max(120),
        targetField: z.string().min(1).max(120),
    }))
        .max(60)
        .default([]),
})
    .strict();
/** GST reconciliation run creation. */
export const gstRunSchema = z
    .object({
    engagementId: id,
    clientId: id,
    purchaseLedgerDocumentId: id,
    gstr2bDocumentId: id,
    period: monthsRange,
    params: z
        .object({
        toleranceDays: z.number().int().min(0).max(90).default(5),
        amountTolerancePaise: z.number().int().min(0).max(1000000).default(100),
        creditNoteMode: z.enum(['match', 'separate', 'ignore']).default('match'),
        fuzzyMatch: z.boolean().default(true),
        strictGstin: z.boolean().default(false),
    })
        .default({}),
})
    .strict();
export const bankRunSchema = z
    .object({
    engagementId: id,
    clientId: id,
    bankStatementDocumentId: id,
    bookLedgerDocumentId: id,
    bankAccount: z.object({
        accountNumber: z.string().max(40),
        ifsc: z.string().optional(),
        bankName: z.string().max(120).optional(),
    }),
    period: monthsRange,
    params: z
        .object({
        toleranceDays: z.number().int().min(0).max(90).default(3),
        amountTolerancePaise: z.number().int().min(0).max(1000000).default(0),
        matchChequeNos: z.boolean().default(true),
        matchUtrs: z.boolean().default(true),
    })
        .default({}),
})
    .strict();
export const aisRunSchema = z
    .object({
    engagementId: id,
    clientId: id,
    ais26asDocumentId: id,
    booksDocumentId: id.optional(),
    tan: z.string().optional(),
    period: monthsRange,
    params: z
        .object({
        toleranceDays: z.number().int().min(0).max(90).default(5),
        amountTolerancePaise: z.number().int().min(0).max(1000000).default(100),
        matchBySection: z.boolean().default(true),
    })
        .default({}),
})
    .strict();
/** Generic run creation discriminated by type. */
export const createRunSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal(ReconType.GST), data: gstRunSchema }),
    z.object({ type: z.literal(ReconType.Bank), data: bankRunSchema }),
    z.object({ type: z.literal(ReconType.AIS26AS), data: aisRunSchema }),
]);
export const runQuerySchema = z.object({
    engagementId: id.optional(),
    clientId: id.optional(),
    type: z.nativeEnum(ReconType).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
//# sourceMappingURL=document.js.map