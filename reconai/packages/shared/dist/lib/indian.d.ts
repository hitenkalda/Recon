/**
 * Indian business identifier validators.
 * These are pure, deterministic regular expressions — no AI involvement.
 */
export interface ValidationResult {
    valid: boolean;
    reason?: string;
}
export declare function validatePAN(raw: string): ValidationResult;
export declare function validateGSTIN(raw: string): ValidationResult;
export declare function validateTAN(raw: string): ValidationResult;
export declare function validateCIN(raw: string): ValidationResult;
export declare function validateIFSC(raw: string): ValidationResult;
export declare function validateMobile(raw: string): ValidationResult;
export declare function validateAadhaar(raw: string): ValidationResult;
export declare function validatePincode(raw: string): ValidationResult;
/** Indian state codes for GST (name → code mapping, commonly used subset). */
export declare const GST_STATE_CODES: Record<string, string>;
export declare function gstStateName(code: string): string | undefined;
//# sourceMappingURL=indian.d.ts.map