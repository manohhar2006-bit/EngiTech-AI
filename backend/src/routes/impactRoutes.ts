/**
 * EngiTrace Phase 6 - What-If Impact Analysis API Routes
 */

import { Router } from 'express';
import { ImpactController } from '../controllers/impactController';

export const impactRoutes = Router();

// POST Execute What-If Impact Query against repository graph
impactRoutes.post('/:id/impact', ImpactController.executeImpactQuery);

// GET What-If Impact Query by node ID
impactRoutes.get('/:id/impact/:nodeId', ImpactController.getImpactByNodeId);

// POST Execute Grounded AI Explanation for Impact Analysis
impactRoutes.post('/:id/impact/:nodeId/explain', ImpactController.explainImpact);
