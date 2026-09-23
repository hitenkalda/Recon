import prisma from '../../prisma.js';
import { logger } from '../../logger.js';
import { engine } from '../../services/engineClient.js';
import { presignedGetUrl, sha256OfObject } from '../../storage/storage.js';
import type { DocumentJob } from '../../queues.js';
import { ProcessingStage } from '@reconai/shared';

const CHUNK = 400;

async function persistRecords(
  documentId: string,
  firmId: string,
  rows: Array<{ rowIndex?: number; data: Record<string, unknown>; confidence?: number; status?: string; warnings?: string[] }>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await prisma.sourceRecord.createMany({
      data: slice.map((r) => ({
        documentId,
        firmId,
        rowIndex: r.rowIndex,
        data: r.data as object,
        confidence: r.confidence ?? 1,
        validationStatus: r.status === 'error' ? 'error' : r.status === 'warning' ? 'warning' : 'valid',
        warnings: r.warnings as object | undefined,
        raw: r as unknown as object,
      })),
    });
  }
}

export async function processDocument(job: DocumentJob): Promise<void> {
  const { documentId, firmId } = job;

  const processJob = await prisma.processingJob.create({
    data: { documentId, firmId, jobType: 'process', state: 'active', stage: 'scanning', progress: 5 },
  });

  const fail = async (message: string) => {
    await prisma.$transaction([
      prisma.processingJob.update({ where: { id: processJob.id }, data: { state: 'failed', error: message } }),
      prisma.document.update({ where: { id: documentId }, data: { status: ProcessingStage.Failed, failureReason: message } }),
    ]);
    throw new Error(message);
  };

  try {
    const doc = await prisma.document.findFirst({ where: { id: documentId, firmId } });
    if (!doc) return;

    // ── scan + integrity (SHA-256) ──
    const url = await presignedGetUrl(doc.storagePath, 3600);
    const { hash, size } = await sha256OfObject(doc.storagePath);
    await prisma.processingJob.update({ where: { id: processJob.id }, data: { stage: 'scanning', progress: 15 } });

    // duplicate detection within the firm
    const duplicate = await prisma.document.findFirst({
      where: { firmId, sha256: hash, id: { not: doc.id }, status: { notIn: [ProcessingStage.Failed, ProcessingStage.Archived] } },
    });
    if (duplicate) {
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          sha256: hash,
          size: BigInt(size),
          virusScanResult: 'clean',
          isDuplicateOf: duplicate.id,
          recordCount: 0,
          status: ProcessingStage.RecordsReady,
        },
      });
      await prisma.processingJob.update({ where: { id: processJob.id }, data: { state: 'completed', progress: 100, stage: 'duplicate' } });
      logger.info({ documentId, of: duplicate.id }, 'document is a duplicate — skipped processing');
      return;
    }

    // ── extraction + normalization via Python engine ──
    await prisma.processingJob.update({ where: { id: processJob.id }, data: { stage: 'extracting', progress: 30 } });
    const result = await engine.process({ url, filename: doc.originalName, category: doc.category ?? undefined });

    await prisma.processingJob.update({ where: { id: processJob.id }, data: { stage: 'normalizing', progress: 60 } });

    // persist records
    await persistRecords(doc.id, firmId, result.rows);

    const mapping = result.mappingSuggestion;
    const nextStatus = result.rows.length > 0 ? ProcessingStage.RecordsReady : ProcessingStage.ColumnsMapped;

    await prisma.document.update({
      where: { id: doc.id },
      data: {
        sha256: hash,
        size: BigInt(size),
        virusScanResult: 'clean',
        columns: result.columns as object,
        mapping: mapping as object,
        pageCount: result.pageCount,
        recordCount: result.rows.length,
        category: doc.category ?? result.classification?.category ?? doc.category,
        status: nextStatus,
        failureReason: null,
      },
    });

    await prisma.processingJob.update({ where: { id: processJob.id }, data: { state: 'completed', progress: 100, stage: 'done', output: { recordCount: result.rows.length, duplicate: false } } });
    logger.info({ documentId, records: result.rows.length }, 'document processed');
  } catch (e) {
    const message = e instanceof Error ? e.message : 'processing failed';
    logger.error({ documentId, err: message }, 'document processing failed');
    await fail(message);
  }
}