/**
 * EngiTrace EEID Evaluation Runner — Governance & Approval Verifier
 *
 * Implements strict, fail-safe governance checks:
 * - Rejects DRAFT records
 * - Rejects PENDING_HUMAN_REVIEW proposals
 * - Rejects REJECTED records
 * - Rejects missing or fabricated human sign-off metadata
 * - Enforces verifiedAt RFC3339 timestamp
 * - Invariant: Never assume proposed records are approved.
 */

import {
  EEIDRecordV2,
  ApprovalVerificationResult,
  VALID_ANNOTATOR_TYPES,
  ApprovalVerifierOptions,
  DualHumanApprovalProvenance,
  HumanReviewerSignoff
} from '../types';
import { isValidRfc3339Timestamp } from '../../eeid/task3-remediation-proposal-v4.2.5/validator_v2/index_store';

export class ApprovalVerifier {
  /**
   * Verifies that a record has received formal, authentic dual human expert sign-off
   * and is not an unapproved draft, pending proposal, rejected record, or unverified
   * legacy synthetic prototype.
   *
   * Invariants:
   * - Inline fields (VERIFIED, HUMAN_EXPERT, verifiedAt) do not independently establish approval.
   * - Two genuine independent human reviewers with valid identities and signoff evidence required.
   * - Explicit record-level review decisions required (ACCEPT / APPROVED).
   * - Historical synthetic prototype records without dual human approval are quarantined (LEGACY_SYNTHETIC_PROVENANCE_UNVERIFIED).
   * - Synthetic test fixtures remain test-only.
   */
  static verifyApproval(
    record: EEIDRecordV2,
    options?: ApprovalVerifierOptions
  ): ApprovalVerificationResult {
    const meta = record.annotationMetadata;

    // Check 1: Must have annotationMetadata object
    if (!meta || typeof meta !== 'object') {
      return {
        isApproved: false,
        status: 'DRAFT',
        annotatorType: 'AI_ASSISTED_REMEDIATION',
        rejectionReason: 'Missing annotationMetadata block.'
      };
    }

    // Check 2: Reject explicitly rejected records
    if (meta.status === 'REJECTED' || record.proposalStatus === 'REJECTED_BY_HUMAN' || (meta as any).proposalStatus === 'REJECTED_BY_HUMAN') {
      return {
        isApproved: false,
        status: meta.status,
        proposalStatus: record.proposalStatus,
        annotatorType: meta.annotatorType,
        rejectionReason: `Record "${record.recordId}" has status REJECTED.`
      };
    }

    // Check 3: Reject PENDING_HUMAN_REVIEW proposals
    if (
      record.proposalStatus === 'PENDING_HUMAN_REVIEW' ||
      (meta as any).proposalStatus === 'PENDING_HUMAN_REVIEW'
    ) {
      return {
        isApproved: false,
        status: meta.status,
        proposalStatus: 'PENDING_HUMAN_REVIEW',
        annotatorType: meta.annotatorType,
        rejectionReason: `Record "${record.recordId}" is pending formal human expert review (proposalStatus: PENDING_HUMAN_REVIEW). Promotion requires dual human expert sign-off.`
      };
    }

    // Check 4: Reject DRAFT status
    if (meta.status === 'DRAFT') {
      return {
        isApproved: false,
        status: 'DRAFT',
        proposalStatus: record.proposalStatus || (meta as any).proposalStatus,
        annotatorType: meta.annotatorType,
        rejectionReason: `Record "${record.recordId}" has status DRAFT. Only VERIFIED human-approved records may be evaluated.`
      };
    }

    // Check 5: Active status must be VERIFIED
    if (meta.status !== 'VERIFIED') {
      return {
        isApproved: false,
        status: meta.status,
        annotatorType: meta.annotatorType,
        rejectionReason: `Record "${record.recordId}" status is "${meta.status}", expected "VERIFIED".`
      };
    }

    // Check 6: Annotator type must be HUMAN_EXPERT or HYBRID_VERIFIED
    const allowedApprovedAnnotators = new Set(['HUMAN_EXPERT', 'HYBRID_VERIFIED']);
    if (!allowedApprovedAnnotators.has(meta.annotatorType)) {
      return {
        isApproved: false,
        status: meta.status,
        annotatorType: meta.annotatorType,
        rejectionReason: `Record "${record.recordId}" has annotatorType "${meta.annotatorType}". Evaluator requires HUMAN_EXPERT or HYBRID_VERIFIED.`
      };
    }

    // Check 7: verifiedAt timestamp must be valid RFC3339 and non-empty
    if (!meta.verifiedAt || typeof meta.verifiedAt !== 'string' || !isValidRfc3339Timestamp(meta.verifiedAt)) {
      return {
        isApproved: false,
        status: meta.status,
        annotatorType: meta.annotatorType,
        rejectionReason: `Record "${record.recordId}" lacks a valid RFC3339 verifiedAt timestamp (got "${meta.verifiedAt}").`
      };
    }

    // Check 8: Must have verified author
    if (!meta.author || typeof meta.author !== 'string' || meta.author.trim().length === 0) {
      return {
        isApproved: false,
        status: meta.status,
        annotatorType: meta.annotatorType,
        rejectionReason: `Record "${record.recordId}" lacks author in annotationMetadata.`
      };
    }

    // Check 9: Required approval provenance & Dual Human Review Signoff
    // Inline metadata alone (VERIFIED, HUMAN_EXPERT, verifiedAt) DOES NOT establish approval!
    const provenance: DualHumanApprovalProvenance | undefined =
      record.approvalProvenance || (meta as any).approvalProvenance;

    if (!provenance || typeof provenance !== 'object') {
      return {
        isApproved: false,
        status: meta.status,
        annotatorType: meta.annotatorType,
        rejectionReason: `LEGACY_SYNTHETIC_PROVENANCE_UNVERIFIED: Record "${record.recordId}" declares inline VERIFIED status but lacks required approval provenance and dual independent human reviewer signoffs. Inline attributes from historical prototype generator do not establish official approval.`
      };
    }

    // Check 10: Synthetic prototype quarantine
    if (provenance.isSyntheticPrototype === true || provenance.approvalStatus !== 'APPROVED') {
      return {
        isApproved: false,
        status: meta.status,
        annotatorType: meta.annotatorType,
        rejectionReason: `LEGACY_SYNTHETIC_PROVENANCE_UNVERIFIED: Record "${record.recordId}" approval provenance status is "${provenance.approvalStatus}", expected "APPROVED".`
      };
    }

    // Check 11: Synthetic fixtures remain test-only
    const isFixture =
      provenance.isTestFixture === true ||
      record.isTestFixture === true ||
      (meta as any).isTestFixture === true;

    if (isFixture && !options?.allowTestFixtures) {
      return {
        isApproved: false,
        status: meta.status,
        annotatorType: meta.annotatorType,
        rejectionReason: `SYNTHETIC_FIXTURE_TEST_ONLY: Record "${record.recordId}" is a synthetic test fixture and cannot be evaluated in official benchmark execution.`
      };
    }

    // Check 12: Dual independent human reviewers
    const reviewers = provenance.reviewers;
    if (!Array.isArray(reviewers) || reviewers.length < 2) {
      return {
        isApproved: false,
        status: meta.status,
        annotatorType: meta.annotatorType,
        rejectionReason: `Record "${record.recordId}" requires at least two independent human reviewer signoffs (found ${Array.isArray(reviewers) ? reviewers.length : 0}).`
      };
    }

    const [rev1, rev2] = reviewers;

    // Reviewer independence enforcement (distinct individuals)
    const id1 = (rev1?.reviewerId || '').trim().toLowerCase();
    const id2 = (rev2?.reviewerId || '').trim().toLowerCase();
    const name1 = (rev1?.name || '').trim().toLowerCase();
    const name2 = (rev2?.name || '').trim().toLowerCase();

    if ((id1 && id2 && id1 === id2) || (name1 && name2 && name1 === name2)) {
      return {
        isApproved: false,
        status: meta.status,
        annotatorType: meta.annotatorType,
        rejectionReason: `Record "${record.recordId}" fails reviewer independence: both signoffs are from the same reviewer ("${rev1?.name || rev1?.reviewerId}"). Dual independent human review is required.`
      };
    }

    // Reviewer decision and signoff evidence verification
    for (let i = 0; i < 2; i++) {
      const rev = reviewers[i];
      const roleLabel = i === 0 ? 'Lead reviewer' : 'Secondary reviewer';

      if (!rev || typeof rev !== 'object') {
        return {
          isApproved: false,
          status: meta.status,
          annotatorType: meta.annotatorType,
          rejectionReason: `Record "${record.recordId}" ${roleLabel} signoff is missing or malformed.`
        };
      }

      if (!rev.reviewerId || typeof rev.reviewerId !== 'string' || rev.reviewerId.trim().length === 0) {
        return {
          isApproved: false,
          status: meta.status,
          annotatorType: meta.annotatorType,
          rejectionReason: `Record "${record.recordId}" ${roleLabel} missing valid reviewerId.`
        };
      }

      if (!rev.name || typeof rev.name !== 'string' || rev.name.trim().length === 0) {
        return {
          isApproved: false,
          status: meta.status,
          annotatorType: meta.annotatorType,
          rejectionReason: `Record "${record.recordId}" ${roleLabel} missing valid reviewer name.`
        };
      }

      if (!rev.title || typeof rev.title !== 'string' || rev.title.trim().length === 0) {
        return {
          isApproved: false,
          status: meta.status,
          annotatorType: meta.annotatorType,
          rejectionReason: `Record "${record.recordId}" ${roleLabel} ("${rev.name}") missing professional title.`
        };
      }

      if (!rev.organization || typeof rev.organization !== 'string' || rev.organization.trim().length === 0) {
        return {
          isApproved: false,
          status: meta.status,
          annotatorType: meta.annotatorType,
          rejectionReason: `Record "${record.recordId}" ${roleLabel} ("${rev.name}") missing organization/affiliation.`
        };
      }

      if (rev.decision !== 'ACCEPT' && rev.decision !== 'APPROVED') {
        return {
          isApproved: false,
          status: meta.status,
          annotatorType: meta.annotatorType,
          rejectionReason: `Record "${record.recordId}" ${roleLabel} ("${rev.name}") decision is "${rev.decision || 'MISSING'}", expected "ACCEPT".`
        };
      }

      if (!rev.signedAt || typeof rev.signedAt !== 'string' || !isValidRfc3339Timestamp(rev.signedAt)) {
        return {
          isApproved: false,
          status: meta.status,
          annotatorType: meta.annotatorType,
          rejectionReason: `Record "${record.recordId}" ${roleLabel} ("${rev.name}") lacks a valid RFC3339 signedAt timestamp (got "${rev.signedAt}").`
        };
      }

      if (!rev.signatureEvidence || typeof rev.signatureEvidence !== 'string' || rev.signatureEvidence.trim().length === 0) {
        return {
          isApproved: false,
          status: meta.status,
          annotatorType: meta.annotatorType,
          rejectionReason: `Record "${record.recordId}" ${roleLabel} ("${rev.name}") lacks verifiable signoff evidence.`
        };
      }

      if (rev.tier6SemanticSignoff !== true) {
        return {
          isApproved: false,
          status: meta.status,
          annotatorType: meta.annotatorType,
          rejectionReason: `Record "${record.recordId}" ${roleLabel} ("${rev.name}") has not confirmed Tier 6 semantic claim entailment sign-off.`
        };
      }
    }

    return {
      isApproved: true,
      status: 'VERIFIED',
      proposalStatus: record.proposalStatus,
      annotatorType: meta.annotatorType,
      verifiedAt: meta.verifiedAt,
      approvalProvenance: provenance
    };
  }
}
