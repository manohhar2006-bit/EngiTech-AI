/**
 * EngiTrace Phase 5 - Deterministic Signal Detectors Engine
 * Pure evidence-backed detector functions. No random scores.
 */

import { GraphNode, GraphEdge } from '../../../../graph-engine/src';
import { NormalizedEvidence } from '../../types/evidence';
import { DecisionDebtSignal, DecisionDebtSignalType } from '../../types/decisionDebt';

export class DecisionDebtDetectors {
  /**
   * Run all 6 deterministic detectors over a node and its evidence neighborhood
   */
  static runAllDetectors(
    targetNode: GraphNode,
    connectedEdges: GraphEdge[],
    nodeEvidence: NormalizedEvidence[]
  ): DecisionDebtSignal[] {
    const signals: DecisionDebtSignal[] = [];

    const sigA = this.detectMissingRationale(targetNode, nodeEvidence);
    if (sigA) signals.push(sigA);

    const sigB = this.detectHistoricalFragmentation(targetNode, connectedEdges, nodeEvidence);
    if (sigB) signals.push(sigB);

    const sigC = this.detectStaleReasoning(targetNode, nodeEvidence, connectedEdges);
    if (sigC) signals.push(sigC);

    const sigD = this.detectRepeatedModifications(targetNode, nodeEvidence);
    if (sigD) signals.push(sigD);

    const sigE = this.detectDependencyEvolution(targetNode, connectedEdges, nodeEvidence);
    if (sigE) signals.push(sigE);

    const sigF = this.detectEvidenceWeakness(targetNode, nodeEvidence);
    if (sigF) signals.push(sigF);

    return signals;
  }

  /**
   * Signal A: Missing Rationale Detector
   * Evaluates if component underwent changes without explicit design or decision documentation.
   */
  static detectMissingRationale(targetNode: GraphNode, nodeEvidence: NormalizedEvidence[]): DecisionDebtSignal | null {
    const modificationEvidence = nodeEvidence.filter(
      (e) => e.relationshipType === 'MODIFIED_BY' || e.relationshipType === 'AUTHORED' || e.source.includes('commit')
    );

    // Check for explicit rationale keywords in evidence titles or descriptions
    const rationaleKeywords = ['rationale', 'design', 'architecture', 'rfc', 'decision', 'refactor', 'mitigate', 'strategy'];
    const explicitRationaleEvidence = nodeEvidence.filter((e) => {
      const text = `${e.title} ${e.description}`.toLowerCase();
      return rationaleKeywords.some((kw) => text.includes(kw)) || e.relationshipType === 'RESOLVES';
    });

    const isExplicitFixOrPR = nodeEvidence.some((e) => e.source.includes('issue') || e.source.includes('pr') || e.relationshipType === 'REFERENCES_ISSUE');

    if (modificationEvidence.length >= 2 && explicitRationaleEvidence.length === 0 && !isExplicitFixOrPR) {
      return {
        id: `sig-miss-rat-${targetNode.id.replace(/[/.:]/g, '_')}`,
        type: 'MISSING_RATIONALE',
        severity: modificationEvidence.length >= 5 ? 'HIGH' : 'MEDIUM',
        title: 'Missing Architectural Rationale',
        description: `Component has ${modificationEvidence.length} recorded modifications but lacks explicit architectural rationale or linked design tickets.`,
        evidenceIds: modificationEvidence.map((e) => e.id),
        confidence: 0.92,
        metadata: { modificationCount: modificationEvidence.length }
      };
    }

    return null;
  }

  /**
   * Signal B: Historical Fragmentation Detector
   * Evaluates if component modifications are fragmented across many commits with low PR/issue context.
   */
  static detectHistoricalFragmentation(
    targetNode: GraphNode,
    connectedEdges: GraphEdge[],
    nodeEvidence: NormalizedEvidence[]
  ): DecisionDebtSignal | null {
    const commitEvidence = nodeEvidence.filter((e) => e.source.includes('commit'));
    const prOrIssueEvidence = nodeEvidence.filter((e) => e.source.includes('pr') || e.source.includes('issue') || e.target.includes('issue'));

    if (commitEvidence.length >= 3 && prOrIssueEvidence.length === 0) {
      return {
        id: `sig-frag-${targetNode.id.replace(/[/.:]/g, '_')}`,
        type: 'HISTORICAL_FRAGMENTATION',
        severity: commitEvidence.length >= 6 ? 'HIGH' : 'MEDIUM',
        title: 'Historical Fragmentation',
        description: `Modified across ${commitEvidence.length} commits without associated pull requests or issue tickets to ground intent.`,
        evidenceIds: commitEvidence.map((e) => e.id),
        confidence: 0.88,
        metadata: { commitCount: commitEvidence.length, issueCount: prOrIssueEvidence.length }
      };
    }

    return null;
  }

  /**
   * Signal C: Stale Reasoning Detector
   * Evaluates if the last rationale/commit evidence is old relative to current architecture.
   */
  static detectStaleReasoning(
    targetNode: GraphNode,
    nodeEvidence: NormalizedEvidence[],
    connectedEdges: GraphEdge[]
  ): DecisionDebtSignal | null {
    if (nodeEvidence.length === 0) return null;

    // Find latest evidence timestamp
    const timestamps = nodeEvidence
      .map((e) => (e.timestamp ? new Date(e.timestamp).getTime() : 0))
      .filter((t) => t > 0);

    if (timestamps.length === 0) return null;

    const newestTimestamp = Math.max(...timestamps);
    const now = new Date().getTime(); // Dynamic current execution date
    const ageInDays = (now - newestTimestamp) / (1000 * 60 * 60 * 24);
    const ageInYears = Number((ageInDays / 365.25).toFixed(1));

    // Stale if > 1.5 years old and connected to 2+ edges
    if (ageInYears >= 1.5 && connectedEdges.length >= 2) {
      const oldestEv = nodeEvidence.find((e) => e.timestamp && new Date(e.timestamp).getTime() === newestTimestamp);
      return {
        id: `sig-stale-${targetNode.id.replace(/[/.:]/g, '_')}`,
        type: 'STALE_REASONING',
        severity: ageInYears >= 2.5 ? 'HIGH' : 'MEDIUM',
        title: 'Stale Decision Rationale',
        description: `Last contextual rationale was recorded ${ageInYears} years ago (${new Date(newestTimestamp).toLocaleDateString()}). Surrounding graph topology has evolved.`,
        evidenceIds: oldestEv ? [oldestEv.id] : nodeEvidence.slice(0, 2).map((e) => e.id),
        confidence: 0.85,
        metadata: { ageInYears, lastActiveDate: new Date(newestTimestamp).toISOString() }
      };
    }

    return null;
  }

  /**
   * Signal D: Repeated Modifications Detector
   * Evaluates high-frequency modification churn indicating unresolved architectural assumptions.
   */
  static detectRepeatedModifications(targetNode: GraphNode, nodeEvidence: NormalizedEvidence[]): DecisionDebtSignal | null {
    const modEvidence = nodeEvidence.filter((e) => e.relationshipType === 'MODIFIED_BY' || e.source.includes('commit'));

    if (modEvidence.length >= 4) {
      return {
        id: `sig-rep-mod-${targetNode.id.replace(/[/.:]/g, '_')}`,
        type: 'REPEATED_MODIFICATIONS',
        severity: modEvidence.length >= 8 ? 'HIGH' : 'MEDIUM',
        title: 'Repeated Modifications (High Churn)',
        description: `Component underwent ${modEvidence.length} separate modifications, indicating potential architectural drift or iterative workarounds.`,
        evidenceIds: modEvidence.slice(0, 5).map((e) => e.id),
        confidence: 0.90,
        metadata: { totalModifications: modEvidence.length }
      };
    }

    return null;
  }

  /**
   * Signal E: Dependency Context Detector
   * Evaluates legacy dependency couplings where surrounding components evolved.
   */
  static detectDependencyEvolution(
    targetNode: GraphNode,
    connectedEdges: GraphEdge[],
    nodeEvidence: NormalizedEvidence[]
  ): DecisionDebtSignal | null {
    const isDep = targetNode.type === 'COMPONENT' || targetNode.id.toLowerCase().includes('adapter') || targetNode.id.toLowerCase().includes('client');
    const depEdges = connectedEdges.filter((e) => e.relationshipType === 'DEPENDS_ON' || e.relationshipType === 'IMPORTS');

    if (isDep || depEdges.length >= 3) {
      const explicitDepRationale = nodeEvidence.some((e) => e.title.toLowerCase().includes('dependency') || e.title.toLowerCase().includes('version'));
      if (!explicitDepRationale && connectedEdges.length >= 2) {
        return {
          id: `sig-dep-evo-${targetNode.id.replace(/[/.:]/g, '_')}`,
          type: 'DEPENDENCY_EVOLUTION',
          severity: 'MEDIUM',
          title: 'Unvalidated Dependency Coupling',
          description: `Component maintains ${connectedEdges.length} active architectural dependencies without recent explicit validation evidence.`,
          evidenceIds: nodeEvidence.slice(0, 3).map((e) => e.id),
          confidence: 0.80,
          metadata: { edgeCount: connectedEdges.length }
        };
      }
    }

    return null;
  }

  /**
   * Signal F: Evidence Weakness Detector
   * Evaluates ratio of UNKNOWN/unlinked evidence records for target node.
   */
  static detectEvidenceWeakness(targetNode: GraphNode, nodeEvidence: NormalizedEvidence[]): DecisionDebtSignal | null {
    if (nodeEvidence.length === 0) return null;

    const unknownEvidence = nodeEvidence.filter((e) => e.classification === 'UNKNOWN');
    const unknownRatio = unknownEvidence.length / nodeEvidence.length;

    if (unknownEvidence.length >= 2 && unknownRatio >= 0.5) {
      return {
        id: `sig-ev-wk-${targetNode.id.replace(/[/.:]/g, '_')}`,
        type: 'EVIDENCE_WEAKNESS',
        severity: unknownRatio >= 0.75 ? 'HIGH' : 'MEDIUM',
        title: 'Weak Traceability Chain',
        description: `${Math.round(unknownRatio * 100)}% of connected historical records represent unlinked modifications with missing rationale context.`,
        evidenceIds: unknownEvidence.map((e) => e.id),
        confidence: 0.86,
        metadata: { unknownCount: unknownEvidence.length, totalCount: nodeEvidence.length, ratio: unknownRatio }
      };
    }

    return null;
  }
}
