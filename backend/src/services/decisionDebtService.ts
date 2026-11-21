/**
 * EngiTrace Phase 5 - Decision Debt Engine Service
 * Deterministic evidence-backed Decision Debt calculator & repository health analyzer.
 */

import { EngineeringMemoryGraph, GraphNode, GraphEdge, GraphQueryEngine } from '../../../graph-engine/src';
import { GraphRepository } from './graphRepository';
import { WhyExplorerService } from './whyExplorerService';
import { NormalizedEvidence } from '../types/evidence';
import {
  DecisionDebt,
  DecisionDebtLevel,
  DecisionDebtSignal,
  EvidenceChecklist,
  RepositoryDecisionDebtSummary,
  ReviewPriority
} from '../types/decisionDebt';
import { DecisionDebtDetectors } from './decision-debt/decisionDebtDetectors';

export class DecisionDebtService {
  /**
   * Main entry point: Calculate deterministic Decision Debt for a component node
   */
  static calculateComponentDebt(repositoryId: string, nodeId: string): DecisionDebt {
    const graph = GraphRepository.getGraph(repositoryId);

    // Fallback if graph is not loaded or node not found
    if (!graph) {
      return this.generateEmptyDebt(repositoryId, nodeId, 'Repository graph not loaded.');
    }

    const targetNode = GraphQueryEngine.findNode(graph, nodeId) || graph.nodes.find((n) => n.id === nodeId || n.label.toLowerCase() === nodeId.toLowerCase());

    if (!targetNode) {
      return this.generateEmptyDebt(repositoryId, nodeId, `Target node "${nodeId}" not found in graph.`);
    }

    // 1. Get graph neighborhood & connected evidence
    const neighborhood = GraphQueryEngine.getNeighborhood(graph, targetNode.id, 2);
    const connectedEdges = neighborhood.edges;

    // Retrieve evidence from WhyExplorerService or node metadata
    const whyResult = WhyExplorerService.executeQuery({ repositoryId, nodeId: targetNode.id });
    const nodeEvidence: NormalizedEvidence[] = whyResult ? whyResult.evidence : [];

    // 2. Insufficient Evidence Guard: If < 2 evidence items and node has no edges
    if (nodeEvidence.length < 2 && connectedEdges.length === 0) {
      return this.generateInsufficientDebt(repositoryId, targetNode, nodeEvidence);
    }

    // 3. Run Deterministic Signal Detectors
    const signals = DecisionDebtDetectors.runAllDetectors(targetNode, connectedEdges, nodeEvidence);

    // 4. Calculate Deterministic Debt Score (0 - 100)
    let score = 0;

    signals.forEach((sig) => {
      switch (sig.type) {
        case 'MISSING_RATIONALE':
          score += sig.severity === 'HIGH' ? 30 : 18;
          break;
        case 'HISTORICAL_FRAGMENTATION':
          score += sig.severity === 'HIGH' ? 25 : 15;
          break;
        case 'STALE_REASONING':
          score += sig.severity === 'HIGH' ? 20 : 12;
          break;
        case 'REPEATED_MODIFICATIONS':
          score += sig.severity === 'HIGH' ? 20 : 12;
          break;
        case 'DEPENDENCY_EVOLUTION':
          score += sig.severity === 'HIGH' ? 15 : 8;
          break;
        case 'EVIDENCE_WEAKNESS':
          score += sig.severity === 'HIGH' ? 20 : 10;
          break;
      }
    });

    // 5. Apply Evidence Checklist Rewards & Penalties
    const evidenceChecklist = this.buildEvidenceChecklist(nodeEvidence);

    if (evidenceChecklist.explicitRationale) score -= 25;
    if (evidenceChecklist.recentValidation) score -= 15;
    if (evidenceChecklist.issueEvidence && evidenceChecklist.pullRequestEvidence) score -= 10;

    // Cap score strictly between 0 and 100
    score = Math.max(0, Math.min(100, Math.round(score)));

    // 6. Determine Debt Level
    let level: DecisionDebtLevel = 'LOW';
    if (score >= 90 && signals.filter((s) => s.severity === 'HIGH').length >= 2) {
      level = 'CRITICAL';
    } else if (score >= 75) {
      level = 'HIGH';
    } else if (score >= 45) {
      level = 'MEDIUM';
    } else {
      level = 'LOW';
    }

    // 7. Compute Explainable Confidence (0.40 - 0.98)
    const confidence = this.calculateConfidence(nodeEvidence, connectedEdges, signals);

    // 8. Determine Review Priority
    const reviewPriority = this.determineReviewPriority(level, confidence);

    // 9. Generate Deterministic Explanation
    const explanation = this.generateExplanation(targetNode, level, score, signals, evidenceChecklist);

    // 10. Determine Age Meta
    const ageMeta = this.extractAgeMeta(nodeEvidence);

    return {
      id: `debt-${repositoryId}-${targetNode.id.replace(/[/.:]/g, '_')}`,
      repositoryId,
      targetNodeId: targetNode.id,
      targetNodeLabel: targetNode.label,
      targetNodeType: targetNode.type,
      level,
      score,
      confidence,
      signals,
      evidence: nodeEvidence,
      evidenceChecklist,
      explanation,
      reviewPriority,
      lastRationaleDate: ageMeta.lastDate,
      reasoningAgeYears: ageMeta.ageYears,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Calculate Repository-wide Decision Debt Summary & Health Metrics
   */
  static analyzeRepositoryDebt(repositoryId: string): RepositoryDecisionDebtSummary {
    const graph = GraphRepository.getGraph(repositoryId);

    if (!graph || graph.nodes.length === 0) {
      return this.generateEmptyRepositorySummary(repositoryId);
    }

    const componentDebts: DecisionDebt[] = [];
    let totalEvidenceCount = 0;
    let groundedEvidenceCount = 0;
    let sufficientContextCount = 0;

    // Process nodes (prioritize COMPONENT, FUNCTION, DECISION, REPOSITORY)
    const keyNodes = graph.nodes.filter(
      (n) => n.type === 'COMPONENT' || n.type === 'FUNCTION' || n.type === 'DECISION' || n.type === 'REPOSITORY'
    );

    const nodesToAnalyze = keyNodes.length > 0 ? keyNodes : graph.nodes.slice(0, 30);

    nodesToAnalyze.forEach((node) => {
      const debt = this.calculateComponentDebt(repositoryId, node.id);
      componentDebts.push(debt);

      // Metric calculations
      const factInfCount = debt.evidence.filter((e) => e.classification === 'FACT' || e.classification === 'INFERENCE').length;
      groundedEvidenceCount += factInfCount;
      totalEvidenceCount += debt.evidence.length;

      if (debt.level !== 'INSUFFICIENT') {
        sufficientContextCount++;
      }
    });

    // Sort by score descending
    componentDebts.sort((a, b) => b.score - a.score);

    // Breakdown count
    const breakdown = {
      HIGH: componentDebts.filter((d) => d.level === 'HIGH' || d.level === 'CRITICAL').length,
      MEDIUM: componentDebts.filter((d) => d.level === 'MEDIUM').length,
      LOW: componentDebts.filter((d) => d.level === 'LOW').length,
      INSUFFICIENT: componentDebts.filter((d) => d.level === 'INSUFFICIENT').length
    };

    // Calculate Overall Repository Score
    const validScores = componentDebts.filter((d) => d.level !== 'INSUFFICIENT').map((d) => d.score);
    const overallScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;

    let overallLevel: DecisionDebtLevel = 'LOW';
    if (overallScore >= 75 || breakdown.HIGH >= 3) overallLevel = 'HIGH';
    else if (overallScore >= 45 || breakdown.MEDIUM >= 4) overallLevel = 'MEDIUM';

    // Calculate Coverage Metrics
    const evidenceCoverage = totalEvidenceCount > 0 ? Number((groundedEvidenceCount / totalEvidenceCount).toFixed(2)) : 0.85;
    const historicalCoverage = nodesToAnalyze.length > 0 ? Number((sufficientContextCount / nodesToAnalyze.length).toFixed(2)) : 0.90;

    const weakContextComponentCount = componentDebts.filter((d) => d.signals.some((s) => s.type === 'MISSING_RATIONALE' || s.type === 'EVIDENCE_WEAKNESS')).length;
    const unresolvedWhyCount = componentDebts.filter((d) => d.level === 'HIGH' || d.level === 'CRITICAL').length;

    const repoSummary = GraphRepository.getSummary(repositoryId);
    const repoName = repoSummary ? repoSummary.repositoryId : repositoryId;

    return {
      repositoryId,
      repositoryName: repoName,
      overallScore,
      overallLevel,
      evidenceCoverage,
      historicalCoverage,
      totalComponents: componentDebts.length,
      breakdown,
      topDebtComponents: componentDebts,
      unresolvedWhyCount,
      weakContextComponentCount,
      analyzedAt: new Date().toISOString()
    };
  }

  /**
   * Build Evidence Checklist
   */
  private static buildEvidenceChecklist(nodeEvidence: NormalizedEvidence[]): EvidenceChecklist {
    const commitEvidence = nodeEvidence.some((e) => e.source.includes('commit') || e.relationshipType === 'MODIFIED_BY' || e.relationshipType === 'AUTHORED');
    const pullRequestEvidence = nodeEvidence.some((e) => e.source.includes('pr') || e.relationshipType === 'INCLUDED_IN_PR');
    const issueEvidence = nodeEvidence.some((e) => e.source.includes('issue') || e.target.includes('issue') || e.relationshipType === 'REFERENCES_ISSUE');

    const explicitRationale = nodeEvidence.some((e) => {
      const text = `${e.title} ${e.description}`.toLowerCase();
      return text.includes('rationale') || text.includes('design') || text.includes('architecture') || text.includes('rfc') || text.includes('explicit');
    });

    const incidentEvidence = nodeEvidence.some((e) => {
      const text = `${e.title} ${e.description}`.toLowerCase();
      return text.includes('fix') || text.includes('outage') || text.includes('bug') || text.includes('incident') || text.includes('exhaustion');
    });

    // Recent validation check (activity within last 180 days relative to current date)
    const now = new Date().getTime();
    const recentValidation = nodeEvidence.some((e) => {
      if (!e.timestamp) return false;
      const ageDays = (now - new Date(e.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      return ageDays <= 180;
    });

    return {
      commitEvidence,
      pullRequestEvidence,
      issueEvidence,
      explicitRationale,
      incidentEvidence,
      recentValidation
    };
  }

  /**
   * Calculate Confidence (0.40 to 0.98)
   */
  private static calculateConfidence(
    nodeEvidence: NormalizedEvidence[],
    connectedEdges: GraphEdge[],
    signals: DecisionDebtSignal[]
  ): number {
    if (nodeEvidence.length === 0) return 0.50;

    const factCount = nodeEvidence.filter((e) => e.classification === 'FACT').length;
    const unknownCount = nodeEvidence.filter((e) => e.classification === 'UNKNOWN').length;

    let conf = 0.55 + factCount * 0.08 + nodeEvidence.length * 0.03 - unknownCount * 0.05;

    // High confidence if multiple signals corroborate
    if (signals.length >= 2) conf += 0.05;

    return Number(Math.max(0.40, Math.min(0.98, conf)).toFixed(2));
  }

  /**
   * Determine Operational Review Priority
   */
  private static determineReviewPriority(level: DecisionDebtLevel, confidence: number): ReviewPriority {
    if (level === 'CRITICAL' || (level === 'HIGH' && confidence >= 0.75)) {
      return 'REVIEW_FIRST';
    }
    if (level === 'HIGH' && confidence < 0.75) {
      return 'INVESTIGATE_EVIDENCE';
    }
    if (level === 'MEDIUM') {
      return 'REVIEW_CONVENIENT';
    }
    if (level === 'INSUFFICIENT') {
      return 'INSUFFICIENT_DATA';
    }
    return 'MONITOR';
  }

  /**
   * Generate Deterministic Explanation Summary
   */
  private static generateExplanation(
    targetNode: GraphNode,
    level: DecisionDebtLevel,
    score: number,
    signals: DecisionDebtSignal[],
    checklist: EvidenceChecklist
  ): string {
    if (signals.length === 0) {
      return `${targetNode.type} "${targetNode.label}" has a clean reasoning trail with explicit architectural rationale and recent validation. Decision Debt is LOW (${score}/100).`;
    }

    const signalTitles = signals.map((s) => s.title).join(', ');

    return `Decision Debt for ${targetNode.type} "${targetNode.label}" is assessed as ${level} (Score: ${score}/100). Primary contributing factors include: ${signalTitles}. ${
      checklist.explicitRationale ? 'Explicit design rationale was detected.' : 'No explicit design rationale documentation was found in repository memory.'
    }`;
  }

  /**
   * Extract Rationale Age Meta
   */
  private static extractAgeMeta(nodeEvidence: NormalizedEvidence[]): { lastDate?: string; ageYears?: number } {
    const timestamps = nodeEvidence.map((e) => (e.timestamp ? new Date(e.timestamp).getTime() : 0)).filter((t) => t > 0);
    if (timestamps.length === 0) return {};

    const newest = Math.max(...timestamps);
    const now = new Date().getTime();
    const ageDays = (now - newest) / (1000 * 60 * 60 * 24);

    return {
      lastDate: new Date(newest).toISOString().split('T')[0],
      ageYears: Number((ageDays / 365.25).toFixed(1))
    };
  }

  /**
   * Generate Fallback for Insufficient Evidence
   */
  private static generateInsufficientDebt(repositoryId: string, targetNode: GraphNode, evidence: NormalizedEvidence[]): DecisionDebt {
    return {
      id: `debt-${repositoryId}-${targetNode.id.replace(/[/.:]/g, '_')}`,
      repositoryId,
      targetNodeId: targetNode.id,
      targetNodeLabel: targetNode.label,
      targetNodeType: targetNode.type,
      level: 'INSUFFICIENT',
      score: 0,
      confidence: 0.35,
      signals: [],
      evidence,
      evidenceChecklist: {
        commitEvidence: evidence.length > 0,
        pullRequestEvidence: false,
        issueEvidence: false,
        explicitRationale: false,
        incidentEvidence: false,
        recentValidation: false
      },
      explanation: `INSUFFICIENT EVIDENCE: EngiTrace cannot confidently assess Decision Debt for "${targetNode.label}". Only ${evidence.length} historical records and 0 PR/issue tickets exist in repository memory.`,
      reviewPriority: 'INSUFFICIENT_DATA',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  private static generateEmptyDebt(repositoryId: string, nodeId: string, reason: string): DecisionDebt {
    return {
      id: `debt-empty-${nodeId}`,
      repositoryId,
      targetNodeId: nodeId,
      targetNodeLabel: nodeId,
      targetNodeType: 'UNKNOWN',
      level: 'INSUFFICIENT',
      score: 0,
      confidence: 0.0,
      signals: [],
      evidence: [],
      evidenceChecklist: {
        commitEvidence: false,
        pullRequestEvidence: false,
        issueEvidence: false,
        explicitRationale: false,
        incidentEvidence: false,
        recentValidation: false
      },
      explanation: `Unable to compute Decision Debt: ${reason}`,
      reviewPriority: 'INSUFFICIENT_DATA',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  private static generateEmptyRepositorySummary(repositoryId: string): RepositoryDecisionDebtSummary {
    return {
      repositoryId,
      repositoryName: repositoryId,
      overallScore: 0,
      overallLevel: 'LOW',
      evidenceCoverage: 0,
      historicalCoverage: 0,
      totalComponents: 0,
      breakdown: { HIGH: 0, MEDIUM: 0, LOW: 0, INSUFFICIENT: 0 },
      topDebtComponents: [],
      unresolvedWhyCount: 0,
      weakContextComponentCount: 0,
      analyzedAt: new Date().toISOString()
    };
  }
}
