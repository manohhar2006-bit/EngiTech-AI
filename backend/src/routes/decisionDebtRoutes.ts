/**
 * EngiTrace Phase 5 - Decision Debt API Routes
 */

import { Router, Request, Response } from 'express';
import { DecisionDebtService } from '../services/decisionDebtService';
import { DecisionDebtAiService } from '../services/decisionDebtAiService';

const router = Router();

/**
 * GET /api/v1/repositories/:id/decision-debt
 * Fetch repository-level Decision Debt summary and component debts
 */
router.get('/:id/decision-debt', (req: Request, res: Response) => {
  try {
    const repositoryId = req.params.id;
    const summary = DecisionDebtService.analyzeRepositoryDebt(repositoryId);
    res.json(summary);
  } catch (err: any) {
    console.error(`[DecisionDebtRoutes] Error analyzing repo debt:`, err);
    res.status(500).json({ error: 'Failed to analyze repository Decision Debt', message: err.message });
  }
});

/**
 * GET /api/v1/repositories/:id/decision-debt/:nodeId
 * Fetch single component Decision Debt details
 */
router.get('/:id/decision-debt/:nodeId', (req: Request, res: Response) => {
  try {
    const { id: repositoryId, nodeId } = req.params;
    const debt = DecisionDebtService.calculateComponentDebt(repositoryId, decodeURIComponent(nodeId));
    res.json(debt);
  } catch (err: any) {
    console.error(`[DecisionDebtRoutes] Error calculating component debt:`, err);
    res.status(500).json({ error: 'Failed to calculate component Decision Debt', message: err.message });
  }
});

/**
 * GET /api/v1/repositories/:id/decision-debt/:nodeId/signals
 * Fetch signals list for a component
 */
router.get('/:id/decision-debt/:nodeId/signals', (req: Request, res: Response) => {
  try {
    const { id: repositoryId, nodeId } = req.params;
    const debt = DecisionDebtService.calculateComponentDebt(repositoryId, decodeURIComponent(nodeId));
    res.json({
      nodeId: debt.targetNodeId,
      signals: debt.signals,
      count: debt.signals.length
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch Decision Debt signals', message: err.message });
  }
});

/**
 * GET /api/v1/repositories/:id/decision-debt/:nodeId/evidence
 * Fetch evidence checklist and records for a component
 */
router.get('/:id/decision-debt/:nodeId/evidence', (req: Request, res: Response) => {
  try {
    const { id: repositoryId, nodeId } = req.params;
    const debt = DecisionDebtService.calculateComponentDebt(repositoryId, decodeURIComponent(nodeId));
    res.json({
      nodeId: debt.targetNodeId,
      checklist: debt.evidenceChecklist,
      evidence: debt.evidence,
      count: debt.evidence.length
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch Decision Debt evidence', message: err.message });
  }
});

/**
 * POST /api/v1/repositories/:id/decision-debt/:nodeId/explain
 * Generate AI-grounded explanation for deterministic Decision Debt signals
 */
router.post('/:id/decision-debt/:nodeId/explain', async (req: Request, res: Response) => {
  try {
    const { id: repositoryId, nodeId } = req.params;
    const debt = DecisionDebtService.calculateComponentDebt(repositoryId, decodeURIComponent(nodeId));
    const explanation = await DecisionDebtAiService.explainDecisionDebt(debt);
    res.json(explanation);
  } catch (err: any) {
    console.error(`[DecisionDebtRoutes] Error generating AI explanation:`, err);
    res.status(500).json({ error: 'Failed to generate AI Decision Debt explanation', message: err.message });
  }
});

export default router;
