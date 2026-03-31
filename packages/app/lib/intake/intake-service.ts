import type { IngestionJobStatus, Prisma, PrismaClient } from '@/lib/prisma-client';
import type { IntakeSubmitInput } from './validate';
import { fetchSource } from './fetch-source';
import { fingerprintUrl } from './fingerprint';
import { extractFields } from './extract-fields';
import { matchCanonical } from './match-canonical';

export interface IntakeRunResult {
  sourceDocumentId: string;
  ingestionJobId: string;
  proposedChangeSetId: string | null;
  finalStatus: IngestionJobStatus;
  error?: string;
}

export async function runIntake(
  prisma: PrismaClient,
  input: IntakeSubmitInput,
  userId: string
): Promise<IntakeRunResult> {
  const now = new Date();
  const sourceDocument = await prisma.sourceDocument.create({
    data: {
      sourceUrl: input.sourceUrl,
      sourceType: input.recordTypeOverride ?? null
    }
  });

  const job = await prisma.ingestionJob.create({
    data: {
      sourceDocumentId: sourceDocument.id,
      requestedByUserId: userId,
      status: 'queued',
      startedAt: now
    }
  });

  try {
    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: { status: 'fetching', updatedAt: new Date() }
    });

    const fetchResult = await fetchSource(input.sourceUrl);

    await prisma.sourceDocument.update({
      where: { id: sourceDocument.id },
      data: {
        sourceUrl: fetchResult.finalUrl,
        fetchedAt: fetchResult.fetchedAt,
        httpStatus: fetchResult.httpStatus,
        rawHtml: fetchResult.rawHtml,
        extractedText: fetchResult.extractedText,
        metadataJson: {
          contentType: fetchResult.contentType
        }
      }
    });

    if (fetchResult.error) {
      await prisma.ingestionJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorCode: fetchResult.error,
          errorMessage: fetchResult.error,
          updatedAt: new Date()
        }
      });

      return {
        sourceDocumentId: sourceDocument.id,
        ingestionJobId: job.id,
        proposedChangeSetId: null,
        finalStatus: 'failed',
        error: fetchResult.error
      };
    }

    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: { status: 'extracting', updatedAt: new Date() }
    });

    const fingerprint = fingerprintUrl(fetchResult.finalUrl);
    await prisma.sourceDocument.update({
      where: { id: sourceDocument.id },
      data: {
        fingerprint
      }
    });

    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: { status: 'parsing', updatedAt: new Date() }
    });

    const extractionResult = await extractFields({
      extractedText: fetchResult.extractedText,
      sourceUrl: fetchResult.finalUrl
    });

    const extractionRun = await prisma.extractionRun.create({
      data: {
        sourceDocumentId: sourceDocument.id,
        modelVersion: extractionResult.modelVersion,
        parserVersion: extractionResult.parserVersion,
        extractedFieldsJson: extractionResult.extractedFieldsJson as Prisma.InputJsonValue,
        confidenceJson: extractionResult.confidenceJson as Prisma.InputJsonValue,
        evidenceJson: extractionResult.evidenceJson as Prisma.InputJsonValue,
        warningsJson: extractionResult.warningsJson as Prisma.InputJsonValue
      }
    });

    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: { status: 'matching', updatedAt: new Date() }
    });

    const matchResult = await matchCanonical(prisma, fetchResult.finalUrl);

    const proposedChangeSet = await prisma.proposedChangeSet.create({
      data: {
        sourceDocumentId: sourceDocument.id,
        extractionRunId: extractionRun.id,
        matchedEventId: matchResult.matchedEventId,
        proposedDataJson: extractionResult.extractedFieldsJson as Prisma.InputJsonValue,
        reviewStatus: 'draft'
      }
    });

    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: {
        status: 'needs_review',
        completedAt: new Date(),
        updatedAt: new Date()
      }
    });

    return {
      sourceDocumentId: sourceDocument.id,
      ingestionJobId: job.id,
      proposedChangeSetId: proposedChangeSet.id,
      finalStatus: 'needs_review'
    };
  } catch (error: unknown) {
    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        errorCode: 'intake_unhandled_error',
        errorMessage: error instanceof Error ? error.message : 'unknown_error',
        updatedAt: new Date()
      }
    });

    throw error;
  }
}
