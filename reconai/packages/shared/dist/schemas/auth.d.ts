import { z } from 'zod';
import { Role } from '../types/enums.js';
export declare const signupSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    firmName: z.ZodString;
    firmGstin: z.ZodOptional<z.ZodString>;
    inviteToken: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    name: string;
    email: string;
    password: string;
    firmName: string;
    firmGstin?: string | undefined;
    inviteToken?: string | undefined;
}, {
    name: string;
    email: string;
    password: string;
    firmName: string;
    firmGstin?: string | undefined;
    inviteToken?: string | undefined;
}>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strict", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const inviteSchema: z.ZodObject<{
    email: z.ZodString;
    role: z.ZodEnum<[Role.Partner, Role.Senior, Role.Article, Role.Viewer]>;
    message: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    email: string;
    role: Role.Partner | Role.Senior | Role.Article | Role.Viewer;
    message?: string | undefined;
}, {
    email: string;
    role: Role.Partner | Role.Senior | Role.Article | Role.Viewer;
    message?: string | undefined;
}>;
export declare const firmUpdateSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    gstin: z.ZodOptional<z.ZodString>;
    pan: z.ZodOptional<z.ZodString>;
    tan: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodString>;
    settings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strict", z.ZodTypeAny, {
    name?: string | undefined;
    gstin?: string | undefined;
    pan?: string | undefined;
    tan?: string | undefined;
    address?: string | undefined;
    settings?: Record<string, unknown> | undefined;
}, {
    name?: string | undefined;
    gstin?: string | undefined;
    pan?: string | undefined;
    tan?: string | undefined;
    address?: string | undefined;
    settings?: Record<string, unknown> | undefined;
}>;
export declare const authMe: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    role: z.ZodNativeEnum<typeof Role>;
    firmId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    role: Role;
    id: string;
    firmId: string;
}, {
    email: string;
    role: Role;
    id: string;
    firmId: string;
}>;
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
export type FirmUpdateInput = z.infer<typeof firmUpdateSchema>;
//# sourceMappingURL=auth.d.ts.map