declare const router: import("express-serve-static-core").Router;
declare const CHECKLIST_TEMPLATE: readonly [{
    readonly key: "client_data";
    readonly label: "Client master & KYC collected";
}, {
    readonly key: "gstr_1";
    readonly label: "GSTR-1 / sales register uploaded";
}, {
    readonly key: "gstr_2b";
    readonly label: "GSTR-2B downloaded for the period";
}, {
    readonly key: "gstr_3b";
    readonly label: "GSTR-3B (filed) uploaded";
}, {
    readonly key: "bank_stmt";
    readonly label: "Bank statement uploaded";
}, {
    readonly key: "ais_26as";
    readonly label: "AIS / 26AS downloaded";
}, {
    readonly key: "ledgers";
    readonly label: "Purchase & sales ledgers ({book}) provided";
}, {
    readonly key: "tax_base";
    readonly label: "Tax base (GSTIN/PAN/TAN) confirmed";
}];
export default router;
export { CHECKLIST_TEMPLATE };
//# sourceMappingURL=engagements.d.ts.map