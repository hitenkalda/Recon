import { z } from 'zod';
import { ClientStatus } from '../types/enums.js';
export declare const clientCreateSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodEnum<["company", "llp", "partnership", "proprietorship", "trust", "individual"]>;
    gstin: z.ZodOptional<z.ZodString>;
    pan: z.ZodOptional<z.ZodString>;
    tan: z.ZodOptional<z.ZodString>;
    cin: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodString>;
    contacts: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        email: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
        role: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        email?: string | undefined;
        role?: string | undefined;
        phone?: string | undefined;
    }, {
        name: string;
        email?: string | undefined;
        role?: string | undefined;
        phone?: string | undefined;
    }>, "many">>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    type: "company" | "llp" | "partnership" | "proprietorship" | "trust" | "individual";
    name: string;
    contacts: {
        name: string;
        email?: string | undefined;
        role?: string | undefined;
        phone?: string | undefined;
    }[];
    tags: string[];
    gstin?: string | undefined;
    pan?: string | undefined;
    tan?: string | undefined;
    address?: string | undefined;
    cin?: string | undefined;
}, {
    type: "company" | "llp" | "partnership" | "proprietorship" | "trust" | "individual";
    name: string;
    gstin?: string | undefined;
    pan?: string | undefined;
    tan?: string | undefined;
    address?: string | undefined;
    cin?: string | undefined;
    contacts?: {
        name: string;
        email?: string | undefined;
        role?: string | undefined;
        phone?: string | undefined;
    }[] | undefined;
    tags?: string[] | undefined;
}>;
export declare const clientUpdateSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["company", "llp", "partnership", "proprietorship", "trust", "individual"]>>;
    gstin: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    pan: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    tan: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    cin: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    contacts: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        email: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
        role: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        email?: string | undefined;
        role?: string | undefined;
        phone?: string | undefined;
    }, {
        name: string;
        email?: string | undefined;
        role?: string | undefined;
        phone?: string | undefined;
    }>, "many">>>;
    tags: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
} & {
    status: z.ZodOptional<z.ZodNativeEnum<typeof ClientStatus>>;
}, "strict", z.ZodTypeAny, {
    type?: "company" | "llp" | "partnership" | "proprietorship" | "trust" | "individual" | undefined;
    status?: ClientStatus | undefined;
    name?: string | undefined;
    gstin?: string | undefined;
    pan?: string | undefined;
    tan?: string | undefined;
    address?: string | undefined;
    cin?: string | undefined;
    contacts?: {
        name: string;
        email?: string | undefined;
        role?: string | undefined;
        phone?: string | undefined;
    }[] | undefined;
    tags?: string[] | undefined;
}, {
    type?: "company" | "llp" | "partnership" | "proprietorship" | "trust" | "individual" | undefined;
    status?: ClientStatus | undefined;
    name?: string | undefined;
    gstin?: string | undefined;
    pan?: string | undefined;
    tan?: string | undefined;
    address?: string | undefined;
    cin?: string | undefined;
    contacts?: {
        name: string;
        email?: string | undefined;
        role?: string | undefined;
        phone?: string | undefined;
    }[] | undefined;
    tags?: string[] | undefined;
}>;
export declare const clientQuerySchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodNativeEnum<typeof ClientStatus>>;
    filter: z.ZodDefault<z.ZodEnum<["all", "active_gst", "needs_recon", "tax_audit"]>>;
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    filter: "active_gst" | "needs_recon" | "tax_audit" | "all";
    page: number;
    pageSize: number;
    status?: ClientStatus | undefined;
    search?: string | undefined;
}, {
    filter?: "active_gst" | "needs_recon" | "tax_audit" | "all" | undefined;
    status?: ClientStatus | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
}>;
export declare const clientEngagementCreateSchema: z.ZodObject<{
    clientId: z.ZodString;
    title: z.ZodString;
    kind: z.ZodEnum<["gst_compliance", "tax_audit", "reconciliation", "management_audit", "other"]>;
    financialYear: z.ZodObject<{
        start: z.ZodString;
        end: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        start: string;
        end: string;
    }, {
        start: string;
        end: string;
    }>;
    scope: z.ZodObject<{
        months: z.ZodOptional<z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            from: string;
            to: string;
        }, {
            from: string;
            to: string;
        }>>;
        gstin: z.ZodOptional<z.ZodString>;
        gstr1: z.ZodDefault<z.ZodBoolean>;
        gstr2b: z.ZodDefault<z.ZodBoolean>;
        gstr3b: z.ZodDefault<z.ZodBoolean>;
        bankStatement: z.ZodDefault<z.ZodBoolean>;
        ais26as: z.ZodDefault<z.ZodBoolean>;
        purchaseLedger: z.ZodDefault<z.ZodBoolean>;
        salesLedger: z.ZodDefault<z.ZodBoolean>;
        otherForms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        gstr1: boolean;
        gstr2b: boolean;
        gstr3b: boolean;
        bankStatement: boolean;
        ais26as: boolean;
        purchaseLedger: boolean;
        salesLedger: boolean;
        otherForms: string[];
        gstin?: string | undefined;
        months?: {
            from: string;
            to: string;
        } | undefined;
    }, {
        gstin?: string | undefined;
        months?: {
            from: string;
            to: string;
        } | undefined;
        gstr1?: boolean | undefined;
        gstr2b?: boolean | undefined;
        gstr3b?: boolean | undefined;
        bankStatement?: boolean | undefined;
        ais26as?: boolean | undefined;
        purchaseLedger?: boolean | undefined;
        salesLedger?: boolean | undefined;
        otherForms?: string[] | undefined;
    }>;
    taxBase: z.ZodOptional<z.ZodObject<{
        gstin: z.ZodOptional<z.ZodString>;
        pan: z.ZodOptional<z.ZodString>;
        tan: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        gstin?: string | undefined;
        pan?: string | undefined;
        tan?: string | undefined;
    }, {
        gstin?: string | undefined;
        pan?: string | undefined;
        tan?: string | undefined;
    }>>;
    team: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    clientId: string;
    title: string;
    kind: "tax_audit" | "other" | "gst_compliance" | "reconciliation" | "management_audit";
    financialYear: {
        start: string;
        end: string;
    };
    scope: {
        gstr1: boolean;
        gstr2b: boolean;
        gstr3b: boolean;
        bankStatement: boolean;
        ais26as: boolean;
        purchaseLedger: boolean;
        salesLedger: boolean;
        otherForms: string[];
        gstin?: string | undefined;
        months?: {
            from: string;
            to: string;
        } | undefined;
    };
    team: string[];
    taxBase?: {
        gstin?: string | undefined;
        pan?: string | undefined;
        tan?: string | undefined;
    } | undefined;
}, {
    clientId: string;
    title: string;
    kind: "tax_audit" | "other" | "gst_compliance" | "reconciliation" | "management_audit";
    financialYear: {
        start: string;
        end: string;
    };
    scope: {
        gstin?: string | undefined;
        months?: {
            from: string;
            to: string;
        } | undefined;
        gstr1?: boolean | undefined;
        gstr2b?: boolean | undefined;
        gstr3b?: boolean | undefined;
        bankStatement?: boolean | undefined;
        ais26as?: boolean | undefined;
        purchaseLedger?: boolean | undefined;
        salesLedger?: boolean | undefined;
        otherForms?: string[] | undefined;
    };
    taxBase?: {
        gstin?: string | undefined;
        pan?: string | undefined;
        tan?: string | undefined;
    } | undefined;
    team?: string[] | undefined;
}>;
export declare const engagementUpdateSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["draft", "in_setup", "in_progress", "under_review", "completed", "archived"]>>;
    scope: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    taxBase: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    team: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    conclusion: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    status?: "archived" | "draft" | "in_setup" | "in_progress" | "under_review" | "completed" | undefined;
    title?: string | undefined;
    scope?: Record<string, unknown> | undefined;
    taxBase?: Record<string, unknown> | undefined;
    team?: string[] | undefined;
    conclusion?: string | undefined;
}, {
    status?: "archived" | "draft" | "in_setup" | "in_progress" | "under_review" | "completed" | undefined;
    title?: string | undefined;
    scope?: Record<string, unknown> | undefined;
    taxBase?: Record<string, unknown> | undefined;
    team?: string[] | undefined;
    conclusion?: string | undefined;
}>;
export declare const engagementQuerySchema: z.ZodObject<{
    clientId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["draft", "in_setup", "in_progress", "under_review", "completed", "archived"]>>;
    search: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "archived" | "draft" | "in_setup" | "in_progress" | "under_review" | "completed" | undefined;
    search?: string | undefined;
    clientId?: string | undefined;
}, {
    status?: "archived" | "draft" | "in_setup" | "in_progress" | "under_review" | "completed" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    clientId?: string | undefined;
}>;
export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
export type ClientQuery = z.infer<typeof clientQuerySchema>;
export type EngagementCreateInput = z.infer<typeof clientEngagementCreateSchema>;
export type EngagementUpdateInput = z.infer<typeof engagementUpdateSchema>;
//# sourceMappingURL=client.d.ts.map