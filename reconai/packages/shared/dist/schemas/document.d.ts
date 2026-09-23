import { z } from 'zod';
import { DocumentCategory, ReconType } from '../types/enums.js';
export declare const uploadInitSchema: z.ZodObject<{
    engagementId: z.ZodString;
    clientId: z.ZodString;
    files: z.ZodArray<z.ZodObject<{
        size: z.ZodNumber;
        mime: z.ZodString;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        size: number;
        mime: string;
    }, {
        name: string;
        size: number;
        mime: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    clientId: string;
    engagementId: string;
    files: {
        name: string;
        size: number;
        mime: string;
    }[];
}, {
    clientId: string;
    engagementId: string;
    files: {
        name: string;
        size: number;
        mime: string;
    }[];
}>;
export declare const uploadInitResponse: z.ZodObject<{
    uploadId: z.ZodString;
    uploads: z.ZodArray<z.ZodObject<{
        fieldId: z.ZodString;
        presignedUrl: z.ZodString;
        headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        fieldId: string;
        presignedUrl: string;
        headers?: Record<string, string> | undefined;
    }, {
        fieldId: string;
        presignedUrl: string;
        headers?: Record<string, string> | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    uploadId: string;
    uploads: {
        fieldId: string;
        presignedUrl: string;
        headers?: Record<string, string> | undefined;
    }[];
}, {
    uploadId: string;
    uploads: {
        fieldId: string;
        presignedUrl: string;
        headers?: Record<string, string> | undefined;
    }[];
}>;
export declare const documentConfirmSchema: z.ZodObject<{
    uploadId: z.ZodString;
    fieldId: z.ZodString;
    category: z.ZodOptional<z.ZodNativeEnum<typeof DocumentCategory>>;
}, "strict", z.ZodTypeAny, {
    uploadId: string;
    fieldId: string;
    category?: DocumentCategory | undefined;
}, {
    uploadId: string;
    fieldId: string;
    category?: DocumentCategory | undefined;
}>;
/** Full re-processing of an existing document. */
export declare const reprocessSchema: z.ZodObject<{
    documentId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    documentId: string;
}, {
    documentId: string;
}>;
export declare const documentQuerySchema: z.ZodObject<{
    engagementId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodNativeEnum<typeof DocumentCategory>>;
    status: z.ZodOptional<z.ZodString>;
    search: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: string | undefined;
    search?: string | undefined;
    clientId?: string | undefined;
    engagementId?: string | undefined;
    category?: DocumentCategory | undefined;
}, {
    status?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    clientId?: string | undefined;
    engagementId?: string | undefined;
    category?: DocumentCategory | undefined;
}>;
export declare const columnMappingSchema: z.ZodObject<{
    documentId: z.ZodString;
    mappings: z.ZodDefault<z.ZodArray<z.ZodObject<{
        sourceColumn: z.ZodString;
        targetField: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        sourceColumn: string;
        targetField: string;
    }, {
        sourceColumn: string;
        targetField: string;
    }>, "many">>;
}, "strict", z.ZodTypeAny, {
    documentId: string;
    mappings: {
        sourceColumn: string;
        targetField: string;
    }[];
}, {
    documentId: string;
    mappings?: {
        sourceColumn: string;
        targetField: string;
    }[] | undefined;
}>;
/** GST reconciliation run creation. */
export declare const gstRunSchema: z.ZodObject<{
    engagementId: z.ZodString;
    clientId: z.ZodString;
    purchaseLedgerDocumentId: z.ZodString;
    gstr2bDocumentId: z.ZodString;
    period: z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        from: string;
        to: string;
    }, {
        from: string;
        to: string;
    }>;
    params: z.ZodDefault<z.ZodObject<{
        toleranceDays: z.ZodDefault<z.ZodNumber>;
        amountTolerancePaise: z.ZodDefault<z.ZodNumber>;
        creditNoteMode: z.ZodDefault<z.ZodEnum<["match", "separate", "ignore"]>>;
        fuzzyMatch: z.ZodDefault<z.ZodBoolean>;
        strictGstin: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        toleranceDays: number;
        amountTolerancePaise: number;
        creditNoteMode: "match" | "separate" | "ignore";
        fuzzyMatch: boolean;
        strictGstin: boolean;
    }, {
        toleranceDays?: number | undefined;
        amountTolerancePaise?: number | undefined;
        creditNoteMode?: "match" | "separate" | "ignore" | undefined;
        fuzzyMatch?: boolean | undefined;
        strictGstin?: boolean | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    params: {
        toleranceDays: number;
        amountTolerancePaise: number;
        creditNoteMode: "match" | "separate" | "ignore";
        fuzzyMatch: boolean;
        strictGstin: boolean;
    };
    clientId: string;
    engagementId: string;
    purchaseLedgerDocumentId: string;
    gstr2bDocumentId: string;
    period: {
        from: string;
        to: string;
    };
}, {
    clientId: string;
    engagementId: string;
    purchaseLedgerDocumentId: string;
    gstr2bDocumentId: string;
    period: {
        from: string;
        to: string;
    };
    params?: {
        toleranceDays?: number | undefined;
        amountTolerancePaise?: number | undefined;
        creditNoteMode?: "match" | "separate" | "ignore" | undefined;
        fuzzyMatch?: boolean | undefined;
        strictGstin?: boolean | undefined;
    } | undefined;
}>;
export declare const bankRunSchema: z.ZodObject<{
    engagementId: z.ZodString;
    clientId: z.ZodString;
    bankStatementDocumentId: z.ZodString;
    bookLedgerDocumentId: z.ZodString;
    bankAccount: z.ZodObject<{
        accountNumber: z.ZodString;
        ifsc: z.ZodOptional<z.ZodString>;
        bankName: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        accountNumber: string;
        ifsc?: string | undefined;
        bankName?: string | undefined;
    }, {
        accountNumber: string;
        ifsc?: string | undefined;
        bankName?: string | undefined;
    }>;
    period: z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        from: string;
        to: string;
    }, {
        from: string;
        to: string;
    }>;
    params: z.ZodDefault<z.ZodObject<{
        toleranceDays: z.ZodDefault<z.ZodNumber>;
        amountTolerancePaise: z.ZodDefault<z.ZodNumber>;
        matchChequeNos: z.ZodDefault<z.ZodBoolean>;
        matchUtrs: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        toleranceDays: number;
        amountTolerancePaise: number;
        matchChequeNos: boolean;
        matchUtrs: boolean;
    }, {
        toleranceDays?: number | undefined;
        amountTolerancePaise?: number | undefined;
        matchChequeNos?: boolean | undefined;
        matchUtrs?: boolean | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    params: {
        toleranceDays: number;
        amountTolerancePaise: number;
        matchChequeNos: boolean;
        matchUtrs: boolean;
    };
    clientId: string;
    engagementId: string;
    period: {
        from: string;
        to: string;
    };
    bankStatementDocumentId: string;
    bookLedgerDocumentId: string;
    bankAccount: {
        accountNumber: string;
        ifsc?: string | undefined;
        bankName?: string | undefined;
    };
}, {
    clientId: string;
    engagementId: string;
    period: {
        from: string;
        to: string;
    };
    bankStatementDocumentId: string;
    bookLedgerDocumentId: string;
    bankAccount: {
        accountNumber: string;
        ifsc?: string | undefined;
        bankName?: string | undefined;
    };
    params?: {
        toleranceDays?: number | undefined;
        amountTolerancePaise?: number | undefined;
        matchChequeNos?: boolean | undefined;
        matchUtrs?: boolean | undefined;
    } | undefined;
}>;
export declare const aisRunSchema: z.ZodObject<{
    engagementId: z.ZodString;
    clientId: z.ZodString;
    ais26asDocumentId: z.ZodString;
    booksDocumentId: z.ZodOptional<z.ZodString>;
    tan: z.ZodOptional<z.ZodString>;
    period: z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        from: string;
        to: string;
    }, {
        from: string;
        to: string;
    }>;
    params: z.ZodDefault<z.ZodObject<{
        toleranceDays: z.ZodDefault<z.ZodNumber>;
        amountTolerancePaise: z.ZodDefault<z.ZodNumber>;
        matchBySection: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        toleranceDays: number;
        amountTolerancePaise: number;
        matchBySection: boolean;
    }, {
        toleranceDays?: number | undefined;
        amountTolerancePaise?: number | undefined;
        matchBySection?: boolean | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    params: {
        toleranceDays: number;
        amountTolerancePaise: number;
        matchBySection: boolean;
    };
    clientId: string;
    engagementId: string;
    period: {
        from: string;
        to: string;
    };
    ais26asDocumentId: string;
    tan?: string | undefined;
    booksDocumentId?: string | undefined;
}, {
    clientId: string;
    engagementId: string;
    period: {
        from: string;
        to: string;
    };
    ais26asDocumentId: string;
    params?: {
        toleranceDays?: number | undefined;
        amountTolerancePaise?: number | undefined;
        matchBySection?: boolean | undefined;
    } | undefined;
    tan?: string | undefined;
    booksDocumentId?: string | undefined;
}>;
/** Generic run creation discriminated by type. */
export declare const createRunSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<ReconType.GST>;
    data: z.ZodObject<{
        engagementId: z.ZodString;
        clientId: z.ZodString;
        purchaseLedgerDocumentId: z.ZodString;
        gstr2bDocumentId: z.ZodString;
        period: z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            from: string;
            to: string;
        }, {
            from: string;
            to: string;
        }>;
        params: z.ZodDefault<z.ZodObject<{
            toleranceDays: z.ZodDefault<z.ZodNumber>;
            amountTolerancePaise: z.ZodDefault<z.ZodNumber>;
            creditNoteMode: z.ZodDefault<z.ZodEnum<["match", "separate", "ignore"]>>;
            fuzzyMatch: z.ZodDefault<z.ZodBoolean>;
            strictGstin: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            toleranceDays: number;
            amountTolerancePaise: number;
            creditNoteMode: "match" | "separate" | "ignore";
            fuzzyMatch: boolean;
            strictGstin: boolean;
        }, {
            toleranceDays?: number | undefined;
            amountTolerancePaise?: number | undefined;
            creditNoteMode?: "match" | "separate" | "ignore" | undefined;
            fuzzyMatch?: boolean | undefined;
            strictGstin?: boolean | undefined;
        }>>;
    }, "strict", z.ZodTypeAny, {
        params: {
            toleranceDays: number;
            amountTolerancePaise: number;
            creditNoteMode: "match" | "separate" | "ignore";
            fuzzyMatch: boolean;
            strictGstin: boolean;
        };
        clientId: string;
        engagementId: string;
        purchaseLedgerDocumentId: string;
        gstr2bDocumentId: string;
        period: {
            from: string;
            to: string;
        };
    }, {
        clientId: string;
        engagementId: string;
        purchaseLedgerDocumentId: string;
        gstr2bDocumentId: string;
        period: {
            from: string;
            to: string;
        };
        params?: {
            toleranceDays?: number | undefined;
            amountTolerancePaise?: number | undefined;
            creditNoteMode?: "match" | "separate" | "ignore" | undefined;
            fuzzyMatch?: boolean | undefined;
            strictGstin?: boolean | undefined;
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: ReconType.GST;
    data: {
        params: {
            toleranceDays: number;
            amountTolerancePaise: number;
            creditNoteMode: "match" | "separate" | "ignore";
            fuzzyMatch: boolean;
            strictGstin: boolean;
        };
        clientId: string;
        engagementId: string;
        purchaseLedgerDocumentId: string;
        gstr2bDocumentId: string;
        period: {
            from: string;
            to: string;
        };
    };
}, {
    type: ReconType.GST;
    data: {
        clientId: string;
        engagementId: string;
        purchaseLedgerDocumentId: string;
        gstr2bDocumentId: string;
        period: {
            from: string;
            to: string;
        };
        params?: {
            toleranceDays?: number | undefined;
            amountTolerancePaise?: number | undefined;
            creditNoteMode?: "match" | "separate" | "ignore" | undefined;
            fuzzyMatch?: boolean | undefined;
            strictGstin?: boolean | undefined;
        } | undefined;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<ReconType.Bank>;
    data: z.ZodObject<{
        engagementId: z.ZodString;
        clientId: z.ZodString;
        bankStatementDocumentId: z.ZodString;
        bookLedgerDocumentId: z.ZodString;
        bankAccount: z.ZodObject<{
            accountNumber: z.ZodString;
            ifsc: z.ZodOptional<z.ZodString>;
            bankName: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            accountNumber: string;
            ifsc?: string | undefined;
            bankName?: string | undefined;
        }, {
            accountNumber: string;
            ifsc?: string | undefined;
            bankName?: string | undefined;
        }>;
        period: z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            from: string;
            to: string;
        }, {
            from: string;
            to: string;
        }>;
        params: z.ZodDefault<z.ZodObject<{
            toleranceDays: z.ZodDefault<z.ZodNumber>;
            amountTolerancePaise: z.ZodDefault<z.ZodNumber>;
            matchChequeNos: z.ZodDefault<z.ZodBoolean>;
            matchUtrs: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            toleranceDays: number;
            amountTolerancePaise: number;
            matchChequeNos: boolean;
            matchUtrs: boolean;
        }, {
            toleranceDays?: number | undefined;
            amountTolerancePaise?: number | undefined;
            matchChequeNos?: boolean | undefined;
            matchUtrs?: boolean | undefined;
        }>>;
    }, "strict", z.ZodTypeAny, {
        params: {
            toleranceDays: number;
            amountTolerancePaise: number;
            matchChequeNos: boolean;
            matchUtrs: boolean;
        };
        clientId: string;
        engagementId: string;
        period: {
            from: string;
            to: string;
        };
        bankStatementDocumentId: string;
        bookLedgerDocumentId: string;
        bankAccount: {
            accountNumber: string;
            ifsc?: string | undefined;
            bankName?: string | undefined;
        };
    }, {
        clientId: string;
        engagementId: string;
        period: {
            from: string;
            to: string;
        };
        bankStatementDocumentId: string;
        bookLedgerDocumentId: string;
        bankAccount: {
            accountNumber: string;
            ifsc?: string | undefined;
            bankName?: string | undefined;
        };
        params?: {
            toleranceDays?: number | undefined;
            amountTolerancePaise?: number | undefined;
            matchChequeNos?: boolean | undefined;
            matchUtrs?: boolean | undefined;
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: ReconType.Bank;
    data: {
        params: {
            toleranceDays: number;
            amountTolerancePaise: number;
            matchChequeNos: boolean;
            matchUtrs: boolean;
        };
        clientId: string;
        engagementId: string;
        period: {
            from: string;
            to: string;
        };
        bankStatementDocumentId: string;
        bookLedgerDocumentId: string;
        bankAccount: {
            accountNumber: string;
            ifsc?: string | undefined;
            bankName?: string | undefined;
        };
    };
}, {
    type: ReconType.Bank;
    data: {
        clientId: string;
        engagementId: string;
        period: {
            from: string;
            to: string;
        };
        bankStatementDocumentId: string;
        bookLedgerDocumentId: string;
        bankAccount: {
            accountNumber: string;
            ifsc?: string | undefined;
            bankName?: string | undefined;
        };
        params?: {
            toleranceDays?: number | undefined;
            amountTolerancePaise?: number | undefined;
            matchChequeNos?: boolean | undefined;
            matchUtrs?: boolean | undefined;
        } | undefined;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<ReconType.AIS26AS>;
    data: z.ZodObject<{
        engagementId: z.ZodString;
        clientId: z.ZodString;
        ais26asDocumentId: z.ZodString;
        booksDocumentId: z.ZodOptional<z.ZodString>;
        tan: z.ZodOptional<z.ZodString>;
        period: z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            from: string;
            to: string;
        }, {
            from: string;
            to: string;
        }>;
        params: z.ZodDefault<z.ZodObject<{
            toleranceDays: z.ZodDefault<z.ZodNumber>;
            amountTolerancePaise: z.ZodDefault<z.ZodNumber>;
            matchBySection: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            toleranceDays: number;
            amountTolerancePaise: number;
            matchBySection: boolean;
        }, {
            toleranceDays?: number | undefined;
            amountTolerancePaise?: number | undefined;
            matchBySection?: boolean | undefined;
        }>>;
    }, "strict", z.ZodTypeAny, {
        params: {
            toleranceDays: number;
            amountTolerancePaise: number;
            matchBySection: boolean;
        };
        clientId: string;
        engagementId: string;
        period: {
            from: string;
            to: string;
        };
        ais26asDocumentId: string;
        tan?: string | undefined;
        booksDocumentId?: string | undefined;
    }, {
        clientId: string;
        engagementId: string;
        period: {
            from: string;
            to: string;
        };
        ais26asDocumentId: string;
        params?: {
            toleranceDays?: number | undefined;
            amountTolerancePaise?: number | undefined;
            matchBySection?: boolean | undefined;
        } | undefined;
        tan?: string | undefined;
        booksDocumentId?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: ReconType.AIS26AS;
    data: {
        params: {
            toleranceDays: number;
            amountTolerancePaise: number;
            matchBySection: boolean;
        };
        clientId: string;
        engagementId: string;
        period: {
            from: string;
            to: string;
        };
        ais26asDocumentId: string;
        tan?: string | undefined;
        booksDocumentId?: string | undefined;
    };
}, {
    type: ReconType.AIS26AS;
    data: {
        clientId: string;
        engagementId: string;
        period: {
            from: string;
            to: string;
        };
        ais26asDocumentId: string;
        params?: {
            toleranceDays?: number | undefined;
            amountTolerancePaise?: number | undefined;
            matchBySection?: boolean | undefined;
        } | undefined;
        tan?: string | undefined;
        booksDocumentId?: string | undefined;
    };
}>]>;
export declare const runQuerySchema: z.ZodObject<{
    engagementId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodNativeEnum<typeof ReconType>>;
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    type?: ReconType | undefined;
    clientId?: string | undefined;
    engagementId?: string | undefined;
}, {
    type?: ReconType | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    clientId?: string | undefined;
    engagementId?: string | undefined;
}>;
export type UploadInitInput = z.infer<typeof uploadInitSchema>;
export type DocumentConfirmInput = z.infer<typeof documentConfirmSchema>;
export type ColumnMappingInput = z.infer<typeof columnMappingSchema>;
export type GstRunInput = z.infer<typeof gstRunSchema>;
export type BankRunInput = z.infer<typeof bankRunSchema>;
export type AisRunInput = z.infer<typeof aisRunSchema>;
export type CreateRunInput = z.infer<typeof createRunSchema>;
//# sourceMappingURL=document.d.ts.map