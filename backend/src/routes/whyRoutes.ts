/**
 * EngiTrace Phase 3 & Phase 4 - WHY Explorer & AI Reasoning API Routes
 */

import { Router } from 'express';
import { WhyController } from '../controllers/whyController';
import { ChatController } from '../controllers/chatController';

export const whyRoutes = Router();

// POST Execute WHY query
whyRoutes.post('/:id/why', WhyController.executeWhyQuery);

// GET WHY query by node ID
whyRoutes.get('/:id/why/:nodeId', WhyController.getWhyByNodeId);

// POST Execute AI-Assisted Evidence Reasoning over WHY query
whyRoutes.post('/:id/why/:nodeId/reason', WhyController.executeAiReasoning);
whyRoutes.post('/:id/ai/reason', WhyController.executeAiReasoning);

// GET AI-Assisted Evidence Reasoning Explanation
whyRoutes.get('/:id/why/:nodeId/explanation', WhyController.getAiExplanation);

// GET Node historical timeline
whyRoutes.get('/:id/history/:nodeId', WhyController.getNodeHistory);

// GET Evidence record lookup
whyRoutes.get('/:id/evidence/:evidenceId', WhyController.getEvidenceById);

// POST Contextual AI Chat over node and evidence
whyRoutes.post('/:id/chat', ChatController.handleChat);
