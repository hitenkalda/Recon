import { Router } from 'express';
import { asyncHandler, parseBody } from '../lib/http.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { bigintToJson } from '../prisma.js';
import { engine } from '../services/engineClient.js';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

const classifySchema = z.object({
  headers: z.array(z.string()),
  sampleRows: z.array(z.record(z.unknown())),
  filename: z.string(),
});

const columnMappingSchema = z.object({
  sourceHeaders: z.array(z.string()),
  targetFields: z.array(z.string()),
});

const explainRiskSchema = z.object({
  rowData: z.record(z.unknown()),
  triggeredRules: z.array(z.string()),
});

const draftWorkingPaperSchema = z.object({
  context: z.record(z.unknown()),
});

const exceptionSummarySchema = z.object({
  exceptions: z.array(z.record(z.unknown())),
});

/** POST /api/ai/classify — AI document classification. */
router.post('/classify', requireCapability('documents.upload'), asyncHandler(async (req, res) => {
  const input = parseBody(classifySchema, req.body);

  const result = await engine.aiClassify({
    headers: input.headers,
    sampleRows: input.sampleRows,
    filename: input.filename,
  });

  logAudit(req, { action: 'ai_classify', entityType: 'document', entityId: input.filename, detail: { result } });
  res.json(bigintToJson(result));
}));

/** POST /api/ai/column-mapping — AI column mapping. */
router.post('/column-mapping', requireCapability('documents.upload'), asyncHandler(async (req, res) => {
  const input = parseBody(columnMappingSchema, req.body);

  const result = await engine.aiColumnMapping({
    sourceHeaders: input.sourceHeaders,
    targetFields: input.targetFields,
  });

  logAudit(req, { action: 'ai_column_mapping', entityType: 'document', entityId: 'bulk', detail: { sourceHeaders: input.sourceHeaders.length } });
  res.json(bigintToJson(result));
}));

/** POST /api/ai/explain-risk — AI risk explanation. */
router.post('/explain-risk', requireCapability('exceptions.read'), asyncHandler(async (req, res) => {
  const input = parseBody(explainRiskSchema, req.body);

  const result = await engine.aiExplainRisk({
    rowData: input.rowData,
    triggeredRules: input.triggeredRules,
  });

  logAudit(req, { action: 'ai_explain_risk', entityType: 'exception', entityId: 'analysis', detail: { rules: input.triggeredRules } });
  res.json(bigintToJson(result));
}));

/** POST /api/ai/draft-working-paper — AI WP draft. */
router.post('/draft-working-paper', requireCapability('workingpapers.create'), asyncHandler(async (req, res) => {
  const input = parseBody(draftWorkingPaperSchema, req.body);

  const result = await engine.aiDraftWorkingPaper({
    context: input.context,
  });

  logAudit(req, { action: 'ai_draft_wp', entityType: 'working_paper', entityId: 'draft', detail: { contextKeys: Object.keys(input.context) } });
  res.json(bigintToJson(result));
}));

/** POST /api/ai/exception-summary — AI exception summary. */
router.post('/exception-summary', requireCapability('exceptions.read'), asyncHandler(async (req, res) => {
  const input = parseBody(exceptionSummarySchema, req.body);

  const result = await engine.aiExceptionSummary({
    exceptions: input.exceptions,
  });

  logAudit(req, { action: 'ai_exception_summary', entityType: 'exception', entityId: 'summary', detail: { count: input.exceptions.length } });
  res.json(bigintToJson(result));
}));

export default router;
