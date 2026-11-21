/**
 * EngiTrace Phase 6 - What-If Impact Analysis API Controller
 */

import { Request, Response } from 'express';
import { ImpactAnalysisService } from '../services/impactAnalysisService';
import { ImpactAiService } from '../services/impactAiService';
import { ImpactQuery } from '../types/impactTypes';

export class ImpactController {
  /**
   * POST /api/v1/repositories/:id/impact
   * Execute What-If Impact Query against repository graph
   */
  static executeImpactQuery(req: Request, res: Response): void {
    try {
      const repositoryId = req.params.id;
      const { nodeId, operation = 'REMOVE', maxDepth = 3, options } = req.body;

      if (!nodeId || typeof nodeId !== 'string') {
        res.status(400).json({ error: 'Missing required field: nodeId must be a string.' });
        return;
      }

      const query: ImpactQuery = {
        repositoryId,
        nodeId,
        operation: operation === 'CHANGE' ? 'CHANGE' : 'REMOVE',
        maxDepth: Number(maxDepth) || 3,
        options
      };

      const result = ImpactAnalysisService.analyzeImpact(query);
      res.json(result);
    } catch (err: unknown) {
      console.error('[ImpactController] Failed to execute impact analysis:', err);
      const msg = err instanceof Error ? err.message : 'Internal impact analysis engine error';
      res.status(500).json({ error: msg });
    }
  }

  /**
   * GET /api/v1/repositories/:id/impact/:nodeId
   * Fetch Impact Analysis for a specific target node by ID
   */
  static getImpactByNodeId(req: Request, res: Response): void {
    try {
      const repositoryId = req.params.id;
      const nodeId = decodeURIComponent(req.params.nodeId);

      const query: ImpactQuery = {
        repositoryId,
        nodeId,
        operation: 'REMOVE',
        maxDepth: 3
      };

      const result = ImpactAnalysisService.analyzeImpact(query);
      res.json(result);
    } catch (err: unknown) {
      console.error('[ImpactController] Failed to get impact for node:', err);
      const msg = err instanceof Error ? err.message : 'Internal impact analysis engine error';
      res.status(500).json({ error: msg });
    }
  }

  /**
   * POST /api/v1/repositories/:id/impact/:nodeId/explain
   * Generate Grounded AI Explanation for Impact Analysis
   */
  static async explainImpact(req: Request, res: Response): Promise<void> {
    try {
      const repositoryId = req.params.id;
      const nodeId = decodeURIComponent(req.params.nodeId);

      const query: ImpactQuery = {
        repositoryId,
        nodeId,
        operation: 'REMOVE',
        maxDepth: 3
      };

      const impactResult = ImpactAnalysisService.analyzeImpact(query);
      const aiExplanation = await ImpactAiService.explainImpact(impactResult);

      res.json(aiExplanation);
    } catch (err: unknown) {
      console.error('[ImpactController] Failed to generate AI impact explanation:', err);
      const msg = err instanceof Error ? err.message : 'Internal AI impact service error';
      res.status(500).json({ error: msg });
    }
  }
}
