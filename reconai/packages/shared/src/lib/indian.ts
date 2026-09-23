/**
 * Indian business identifier validators.
 * These are pure, deterministic regular expressions — no AI involvement.
 */

/** PAN: AAAPL1234C — 5 alpha + 4 digit + 1 alpha. 4th char indicates entity type. */
const PAN_REGEX = /^[A-Z]{5}\d{4}[A-Z]$/;
const PAN_ENTITY_CHARS = new Set('TBPFCGHJLAR');

/** GSTIN: 2-digit state + 10-char PAN + 1 entity (1-9,A-Z) + Z + 1 check digit. */
const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]$/;

/** TAN: 4 alpha + 5 digit + 1 alpha. */
const TAN_REGEX = /^[A-Z]{4}\d{5}[A-Z]$/;

/** CIN: 21 chars — L + 5 digit industry + 2 char state + 3 char city type + 3 char legal + 6 digit year + 3 digit seq + 1 alpha. */
const CIN_REGEX = /^[A-Z]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}[A-Z]$/;

/** IFSC: 4 alpha (bank) + 0 + 6 alphanumeric (branch). */
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Indian mobile: 6-9 start + 9 digits. */
const MOBILE_REGEX = /^[6-9]\d{9}$/;

/** Aadhaar: 12 digits (UIDAI format, no verification algorithm exposed). */
const AADHAAR_REGEX = /^\d{12}$/;

/** Pin code: 6 digits. */
const PINCODE_REGEX = /^\d{6}$/;

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

function clean(input: string): string {
  return input.replace(/[\s\-]/g, '').toUpperCase();
}

export function validatePAN(raw: string): ValidationResult {
  const pan = clean(raw);
  if (!PAN_REGEX.test(pan)) return { valid: false, reason: 'Invalid PAN format (expected AAAPL1234C)' };
  if (!PAN_ENTITY_CHARS.has(pan[3])) return { valid: false, reason: `Invalid entity type character '${pan[3]}'` };
  return { valid: true };
}

export function validateGSTIN(raw: string): ValidationResult {
  const gstin = clean(raw);
  if (!GSTIN_REGEX.test(gstin)) return { valid: false, reason: 'Invalid GSTIN format (15 chars: state+PAN+entity+Z+check)' };
  // State code validation
  const stateCode = parseInt(gstin.slice(0, 2), 10);
  if (stateCode < 1 || stateCode > 37 || stateCode === 0) return { valid: false, reason: `Invalid GSTIN state code '${stateCode}'` };
  // Embedded PAN check
  const panResult = validatePAN(gstin.slice(2, 12));
  if (!panResult.valid) return { valid: false, reason: `GSTIN contains invalid PAN: ${panResult.reason}` };
  // Check digit (Luhn-like)
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const idx = chars.indexOf(gstin[i]);
    const factor = i % 2 === 0 ? 1 : 2;
    const addend = Math.floor(idx * factor / 36) + (idx * factor) % 36;
    total += addend;
  }
  const checkDigit = chars[(36 - (total % 36)) % 36];
  if (checkDigit !== gstin[14]) return { valid: false, reason: `GSTIN check digit mismatch (expected '${checkDigit}', got '${gstin[14]}')` };
  return { valid: true };
}

export function validateTAN(raw: string): ValidationResult {
  const tan = clean(raw);
  if (!TAN_REGEX.test(tan)) return { valid: false, reason: 'Invalid TAN format (expected AAAA00000A)' };
  return { valid: true };
}

export function validateCIN(raw: string): ValidationResult {
  const cin = clean(raw);
  if (!CIN_REGEX.test(cin)) return { valid: false, reason: 'Invalid CIN format (21 characters expected)' };
  return { valid: true };
}

export function validateIFSC(raw: string): ValidationResult {
  const ifsc = clean(raw);
  if (!IFSC_REGEX.test(ifsc)) return { valid: false, reason: 'Invalid IFSC format (expected XXXX0YYYYYY)' };
  return { valid: true };
}

export function validateMobile(raw: string): ValidationResult {
  const mobile = raw.replace(/[\s\-+91]/g, '');
  if (!MOBILE_REGEX.test(mobile)) return { valid: false, reason: 'Invalid Indian mobile (expected 10 digits, 6-9 start)' };
  return { valid: true };
}

export function validateAadhaar(raw: string): ValidationResult {
  const aadhaar = raw.replace(/\s/g, '');
  if (!AADHAAR_REGEX.test(aadhaar)) return { valid: false, reason: 'Invalid Aadhaar (expected 12 digits)' };
  return { valid: true };
}

export function validatePincode(raw: string): ValidationResult {
  const pin = raw.trim();
  if (!PINCODE_REGEX.test(pin)) return { valid: false, reason: 'Invalid pin code (expected 6 digits)' };
  return { valid: true };
}

/** Indian state codes for GST (name → code mapping, commonly used subset). */
export const GST_STATE_CODES: Record<string, string> = {
  'Jammu & Kashmir': '01', 'Himachal Pradesh': '02', 'Punjab': '03',
  'Chandigarh': '04', 'Uttarakhand': '05', 'Haryana': '06',
  'Delhi': '07', 'Rajasthan': '08', 'Uttar Pradesh': '09',
  'Bihar': '10', 'Sikkim': '11', 'Arunachal Pradesh': '12',
  'Nagaland': '13', 'Manipur': '14', 'Mizoram': '15',
  'Tripura': '16', 'Meghalaya': '17', 'Assam': '18',
  'West Bengal': '19', 'Jharkhand': '20', 'Odisha': '21',
  'Chhattisgarh': '22', 'Madhya Pradesh': '23', 'Gujarat': '24',
  'Daman & Diu': '25', 'Dadra & Nagar Haveli': '26',
  'Maharashtra': '27', 'Andhra Pradesh': '28', 'Karnataka': '29',
  'Goa': '30', 'Lakshadweep': '31', 'Kerala': '32',
  'Tamil Nadu': '33', 'Puducherry': '34',
  'Andaman & Nicobar': '35', 'Telangana': '36', 'Ladakh': '37',
};

export function gstStateName(code: string): string | undefined {
  return Object.entries(GST_STATE_CODES).find(([, c]) => c === code)?.[0];
}