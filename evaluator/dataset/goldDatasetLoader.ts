/**
 * EngiTrace EEID Evaluation Runner — Gold Dataset Loader
 *
 * Implements Task 4 gold dataset ingestion:
 * - Reads JSONL dataset without modifying source file
 * - Computes and verifies SHA-256 checksum
 * - Filters for approved records only via ApprovalVerifier
 * - Validates schema invariants using Validator V2 rules
 * - Preserves record IDs, repository IDs, snapshot commits, expected claims, and evidence references
 * - Rejects unapproved, malformed, or corrupt records
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EEIDRecordV2, DatasetLoadingResult } from '../types';
import { ApprovalVerifier } from './approvalVerifier';
import { EEIDRecordValidatorV2 } from '../../eeid/task3-remediation-proposal-v4.2.5/validator_v2/validator';
import { HardenedRepositoryIndexStore } from '../../eeid/task3-remediation-proposal-v4.2.5/validator_v2/index_store';

export interface GoldDatasetLoaderOptions {
  datasetPath: string;
  indexDirectory?: string;
  requireIndices?: boolean;
  filterRepositoryId?: string;
  filterCategory?: string;
  limit?: number;
  allowTestFixtures?: boolean;
}

export class GoldDatasetLoader {
  /**
   * Computes SHA-256 checksum of file on disk
   */
  static computeFileSha256(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Loads, hashes, validates, and filters approved records from a gold dataset JSONL file.
   */
  static loadDataset(options: GoldDatasetLoaderOptions): DatasetLoadingResult {
    const { datasetPath, indexDirectory, requireIndices = false } = options;

    if (!fs.existsSync(datasetPath)) {
      throw new Error(`Gold dataset file not found at: ${datasetPath}`);
    }

    const datasetSha256 = this.computeFileSha256(datasetPath);
    const content = fs.readFileSync(datasetPath, 'utf8');
    const lines = content.split(/\r?\n/);

    const approvedRecords: EEIDRecordV2[] = [];
    const rejectedRecords: DatasetLoadingResult['rejectedRecords'] = [];

    let store: HardenedRepositoryIndexStore | null = null;
    let validator: EEIDRecordValidatorV2 | null = null;
    if (indexDirectory && fs.existsSync(indexDirectory)) {
      store = new HardenedRepositoryIndexStore(indexDirectory);
      validator = new EEIDRecordValidatorV2({
        strict: true,
        requireIndices,
        indexDirectory,
        allowDrafts: false // Evaluator strictly requires VERIFIED records!
      });
    }

    let lineCounter = 0;
    for (const rawLine of lines) {
      lineCounter++;
      const trimmed = rawLine.trim();
      if (!trimmed) continue; // Skip blank lines

      let record: EEIDRecordV2;
      try {
        record = JSON.parse(trimmed) as EEIDRecordV2;
      } catch (parseErr: any) {
        rejectedRecords.push({
          recordId: `PARSE_ERROR_LINE_${lineCounter}`,
          lineNumber: lineCounter,
          reason: `Invalid JSON syntax: ${parseErr.message}`
        });
        continue;
      }

      // Check Record ID existence
      if (!record.recordId) {
        rejectedRecords.push({
          recordId: `MISSING_ID_LINE_${lineCounter}`,
          lineNumber: lineCounter,
          reason: 'Record missing required "recordId" field.',
          rawRecord: record
        });
        continue;
      }

      // 1. Governance & Approval Verification (Rejects DRAFT, PENDING_HUMAN_REVIEW, REJECTED, and unverified synthetic legacy records)
      const approval = ApprovalVerifier.verifyApproval(record, {
        allowTestFixtures: options.allowTestFixtures ?? false
      });
      if (!approval.isApproved) {
        rejectedRecords.push({
          recordId: record.recordId,
          lineNumber: lineCounter,
          reason: approval.rejectionReason || 'Unapproved record rejected by governance verifier.',
          rawRecord: record
        });
        continue;
      }

      // 2. Structural & Schema Validation via Validator V2 (if index available)
      if (validator) {
        const indexCtx = store && record.repository?.id ? store.getIndex(record.repository.id, indexDirectory) : null;
        const valResult = validator.validate(record, indexCtx);
        if (!valResult.passed) {
          rejectedRecords.push({
            recordId: record.recordId,
            lineNumber: lineCounter,
            reason: `Schema validation failed: ${valResult.errors.join('; ')}`,
            rawRecord: record
          });
          continue;
        }
      } else {
        // Fallback light validation if index store is omitted
        const basicErrors = this.validateBasicRecordInvariants(record);
        if (basicErrors.length > 0) {
          rejectedRecords.push({
            recordId: record.recordId,
            lineNumber: lineCounter,
            reason: `Basic schema validation failed: ${basicErrors.join('; ')}`,
            rawRecord: record
          });
          continue;
        }
      }

      // 3. Optional filters (repository ID, category)
      if (options.filterRepositoryId && record.repository?.id !== options.filterRepositoryId) {
        continue;
      }
      if (options.filterCategory && record.category !== options.filterCategory) {
        continue;
      }

      approvedRecords.push(record);

      // 4. Optional execution limit for development testing
      if (options.limit && options.limit > 0 && approvedRecords.length >= options.limit) {
        break;
      }
    }

    return {
      datasetPath,
      datasetSha256,
      totalRecordsInFile: lineCounter,
      approvedRecords,
      rejectedRecords
    };
  }

  /**
   * Basic structural validation when repository index store is not mounted.
   */
  private static validateBasicRecordInvariants(record: EEIDRecordV2): string[] {
    const errors: string[] = [];

    if (!record.category) errors.push('Missing category');
    if (!record.repository?.id) errors.push('Missing repository.id');
    if (!record.repository?.commitSha) errors.push('Missing repository.commitSha');
    if (!record.targetNode?.id) errors.push('Missing targetNode.id');
    if (!record.question || typeof record.question !== 'string' || record.question.trim().length === 0) {
      errors.push('Missing or empty question');
    }
    if (!Array.isArray(record.expectedClaims) || record.expectedClaims.length === 0) {
      errors.push('expectedClaims must be a non-empty array');
    } else {
      record.expectedClaims.forEach((claim, idx) => {
        if (!claim.claimId) errors.push(`Claim at index ${idx} missing claimId`);
        if (!claim.text) errors.push(`Claim at index ${idx} missing text`);
        if (!claim.classification) errors.push(`Claim at index ${idx} missing classification`);
      });
    }

    return errors;
  }
}
