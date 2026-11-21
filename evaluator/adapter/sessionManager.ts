/**
 * EngiTrace EEID Evaluation Runner — Session Isolation Manager
 *
 * Enforces session isolation invariants:
 * - Every benchmark question runs in a fresh, isolated session.
 * - Single-turn message payload: `[{ role: 'user', content: question }]`.
 * - Prevents state or context leakage across benchmark questions.
 * - Guarantees expected gold answers and claims are never exposed to the assistant.
 */

import { EEIDRecordV2, AssistantRequestPayload } from '../types';

export class SessionManager {
  /**
   * Constructs a fresh, isolated assistant request payload for a benchmark question.
   * Strictly omits gold expected answer, claims, and ground truth.
   */
  static createIsolatedSession(record: EEIDRecordV2): AssistantRequestPayload {
    // 1. Determine analysis type
    const isWhatIf =
      record.category === 'IMPACT_ANALYSIS' ||
      record.questionContext?.interactionMode === 'WHAT_IF';
    const analysisType: 'WHY' | 'WHAT_IF' = isWhatIf ? 'WHAT_IF' : 'WHY';

    // 2. Build target node metadata without leaking gold context
    const nodeMetadata = {
      name: record.targetNode.label,
      type: record.targetNode.type,
      filePath: record.targetNode.filePath,
      repositoryId: record.repository.id,
      commitSha: record.repository.commitSha
    };

    // 3. Isolated single-turn user question
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      {
        role: 'user',
        content: record.question
      }
    ];

    return {
      nodeId: record.targetNode.id,
      analysisType,
      messages,
      nodeMetadata
    };
  }
}
