/**
 * EngiTrace Phase 3 & Phase 4 - WHY Explorer & AI Reasoning API Controller
 */

import { Request, Response } from 'express';
import { WhyExplorerService } from '../services/whyExplorerService';
import { GraphRepository } from '../services/graphRepository';
import { ReasoningService } from '../../../ai-engine/services/reasoningService';

export class WhyController {
  /**
   * POST /api/v1/repositories/:id/why
   * Body: { nodeId: string, question?: string, options?: object }
   */
  static executeWhyQuery(req: Request, res: Response): void {
    const { id } = req.params;
    const { nodeId, question, options } = req.body as { nodeId?: string; question?: string; options?: object };

    if (!nodeId) {
      res.status(400).json({ error: 'Field "nodeId" is required in request body.' });
      return;
    }

    const result = WhyExplorerService.executeQuery({
      repositoryId: id,
      nodeId,
      question,
      options
    });

    res.json(result);
  }

  /**
   * GET /api/v1/repositories/:id/why/:nodeId
   */
  static getWhyByNodeId(req: Request, res: Response): void {
    const { id, nodeId } = req.params;
    const question = req.query.question as string | undefined;

    const result = WhyExplorerService.executeQuery({
      repositoryId: id,
      nodeId,
      question
    });

    res.json(result);
  }

  /**
   * POST /api/v1/repositories/:id/why/:nodeId/reason
   * Execute Phase 4 AI-Assisted Evidence Reasoning over WHY Query result
   */
  static async executeAiReasoning(req: Request, res: Response): Promise<void> {
    const { id, nodeId } = req.params;
    const { question } = req.body as { question?: string };

    const whyResult = WhyExplorerService.executeQuery({
      repositoryId: id,
      nodeId: nodeId || req.body?.nodeId,
      question
    });

    try {
      const aiResponse = await ReasoningService.reasonOverEvidence(whyResult);
      res.json(aiResponse);
    } catch (err: any) {
      console.error('[WhyController] Error during AI reasoning execution:', err);
      res.status(500).json({
        error: 'Failed to execute AI evidence reasoning.',
        details: err?.message || String(err)
      });
    }
  }

  /**
   * GET /api/v1/repositories/:id/why/:nodeId/explanation
   * Alias endpoint to fetch AI evidence reasoning explanation
   */
  static async getAiExplanation(req: Request, res: Response): Promise<void> {
    const { id, nodeId } = req.params;
    const question = req.query.question as string | undefined;

    const whyResult = WhyExplorerService.executeQuery({
      repositoryId: id,
      nodeId,
      question
    });

    try {
      const aiResponse = await ReasoningService.reasonOverEvidence(whyResult);
      res.json(aiResponse);
    } catch (err: any) {
      console.error('[WhyController] Error fetching AI explanation:', err);
      res.status(500).json({
        error: 'Failed to fetch AI explanation.',
        details: err?.message || String(err)
      });
    }
  }

  /**
   * GET /api/v1/repositories/:id/history/:nodeId
   * Return lightweight timeline event list for a specific node
   */
  static getNodeHistory(req: Request, res: Response): void {
    const { id, nodeId } = req.params;

    const result = WhyExplorerService.executeQuery({
      repositoryId: id,
      nodeId
    });

    const timelineEvents = result.historicalChain.map((step) => ({
      stepNumber: step.stepNumber,
      id: step.node.id,
      title: `${step.node.type}: ${step.node.label}`,
      event: step.event,
      classification: step.classification,
      timestamp: step.timestamp || new Date().toISOString(),
      sourceUrl: step.sourceUrl
    }));

    res.json({
      target: result.target,
      totalEvents: timelineEvents.length,
      events: timelineEvents
    });
  }

  /**
   * GET /api/v1/repositories/:id/evidence/:evidenceId
   */
  static getEvidenceById(req: Request, res: Response): void {
    const { id, evidenceId } = req.params;
    const graph = GraphRepository.getGraph(id);

    if (!graph) {
      res.status(404).json({ error: `Repository "${id}" not found.` });
      return;
    }

    const matchingEdge = graph.edges.find((e) => e.id === evidenceId);

    if (!matchingEdge) {
      res.status(404).json({ error: `Evidence record "${evidenceId}" not found.` });
      return;
    }

    res.json({
      evidence: matchingEdge
    });
  }
}
