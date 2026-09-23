import { Router } from 'express';
import { exportSchema, ReportFormat } from '@reconai/shared';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound, BadRequest } from '../lib/http.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { currentUser } from '../types/context.js';
import { bigintToJson } from '../prisma.js';
import { objectKey, presignedPutUrl, presignedGetUrl } from '../storage/storage.js';

const router = Router();
router.use(requireAuth);

/** GET /api/reports — list for an engagement. */
router.get('/', requireCapability('reports.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const page = Number(req.query.page ?? 1);
  const pageSize = Math.min(Number(req.query.pageSize ?? 50), 200);
  const where: Record<string, unknown> = { firmId: me.firmId };
  if (req.query.engagementId) where.engagementId = req.query.engagementId;

  const [items, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        engagement: { select: { id: true, title: true } },
        workingPaper: { select: { id: true, title: true, status: true } },
      },
    }),
    prisma.report.count({ where }),
  ]);
  res.json(bigintToJson({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }));
}));

/** POST /api/reports/generate — assemble + store a report. */
router.post('/generate', requireCapability('reports.generate'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(exportSchema, req.body);
  const { engagementId, scope, payload } = await resolveReportScope(me.firmId, input);
  if (!engagementId) throw BadRequest('Provide runId, exceptionId or workingPaperId');

  const format = input.format as ReportFormat;
  const fileName = `${scope.slug}.${format === ReportFormat.PDF ? 'pdf' : format === ReportFormat.XLSX ? 'xlsx' : 'csv'}`;
  const key = objectKey(me.firmId, engagementId, fileName);

  // MVP: emit the data package as JSON; PDF/XLSX rendering routes through the engine later.
  const body = format === ReportFormat.CSV ? toCsv([payload as Record<string, unknown>]) : JSON.stringify(payload, null, 2);
  const putUrl = await presignedPutUrl(key, 300);

  const report = await prisma.report.create({
    data: {
      firmId: me.firmId,
      engagementId,
      workingPaperId: scope.workingPaperId ?? null,
      format,
      storagePath: key,
      size: BigInt(body.length),
      generatedById: me.userId,
    },
  });

  logAudit(req, { action: 'export', entityType: 'report', entityId: report.id, detail: { format, scope } });
  res.json(bigintToJson({ report, uploadTo: putUrl, content: body }));
}));

/** GET /api/reports/:id/download */
router.get('/:id/download', requireCapability('reports.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const report = await prisma.report.findFirst({ where: { id: req.params.id, firmId: me.firmId } });
  if (!report) throw NotFound('Report not found');
  logAudit(req, { action: 'download', entityType: 'report', entityId: report.id });
  const url = await presignedGetUrl(report.storagePath, 300);
  res.json({ url });
}));

/** GET /api/reports/run/:runId/csv — stream run items as CSV. */
router.get('/run/:runId/csv', requireCapability('reports.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const run = await prisma.reconRun.findFirst({ where: { id: req.params.runId, firmId: me.firmId } });
  if (!run) throw NotFound('Reconciliation not found');
  const items = await prisma.reconItem.findMany({
    where: { runId: run.id, deleted: false },
    include: { recordA: true, recordB: true },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  });

  const rows = items.map((i) => ({
    status: i.matchStatus,
    score: i.score,
    a: i.recordA?.data ? JSON.stringify((i.recordA?.data ?? {}) as object) : '',
    b: i.recordB?.data ? JSON.stringify((i.recordB?.data ?? {}) as object) : '',
    variance: i.variancePaise != null ? Number(i.variancePaise) / 100 : '',
  }));

  logAudit(req, { action: 'export', entityType: 'recon_run', entityId: run.id, detail: { format: 'csv' } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="run-${run.id}.csv"`);
  res.send(toCsv(rows));
}));

async function resolveReportScope(
  firmId: string,
  input: { runId?: string; exceptionId?: string; workingPaperId?: string; format: string },
): Promise<{ engagementId?: string; scope: { slug: string; workingPaperId?: string }; payload: Record<string, unknown> }> {
  if (input.runId) {
    const run = await prisma.reconRun.findFirst({
      where: { id: input.runId, firmId },
      include: {
        client: { select: { name: true, gstin: true } },
        engagement: { select: { title: true } },
        exceptions: { take: 200 },
      },
    });
    if (!run) throw NotFound('Reconciliation not found');
    return {
      engagementId: run.engagementId,
      scope: { slug: `report-run-${run.id.slice(-6)}` },
      payload: {
        generatedAt: new Date().toISOString(),
        title: `Reconciliation report — ${run.engagement.title}`,
        client: run.client,
        run: { id: run.id, type: run.type, status: run.status, metrics: run.metrics },
        exceptions: run.exceptions.map((e) => ({ id: e.id, kind: e.kind, severity: e.severity, status: e.status, title: e.title })),
      },
    };
  }
  if (input.exceptionId) {
    const ex = await prisma.exception.findFirst({ where: { id: input.exceptionId, firmId }, include: { client: { select: { name: true } } } });
    if (!ex) throw NotFound('Exception not found');
    return {
      engagementId: ex.engagementId,
      scope: { slug: `report-exception-${ex.id.slice(-6)}` },
      payload: { generatedAt: new Date().toISOString(), exception: bigintToJson(ex) },
    };
  }
  if (input.workingPaperId) {
    const wp = await prisma.workingPaper.findFirst(
      { where: { id: input.workingPaperId, firmId }, include: { run: { select: { id: true, type: true, metrics: true } }, client: { select: { name: true } } } },
    );
    if (!wp) throw NotFound('Working paper not found');
    return {
      engagementId: wp.engagementId,
      scope: { slug: `report-wp-${wp.id.slice(-6)}`, workingPaperId: wp.id },
      payload: bigintToJson({
        generatedAt: new Date().toISOString(),
        title: wp.title,
        client: wp.client,
        status: wp.status,
        procedures: wp.procedures ?? [],
        conclusion: wp.conclusion ?? '',
        evidenceHash: wp.evidenceHash,
        run: wp.run ? { id: wp.run.id, type: wp.run.type, metrics: wp.run.metrics } : null,
      }) as Record<string, unknown>,
    };
  }
  throw BadRequest('Provide runId, exceptionId or workingPaperId');
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(','));
  return lines.join('\r\n');
}

export default router;