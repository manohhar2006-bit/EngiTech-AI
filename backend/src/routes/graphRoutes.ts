/**
 * EngiTrace Engineering Memory Graph API Routes
 */

import { Router } from 'express';
import { GraphController } from '../controllers/graphController';

export const graphRoutes = Router();

// Full graph retrieval
graphRoutes.get('/:id/graph', GraphController.getGraph);

// Graph summary
graphRoutes.get('/:id/graph/summary', GraphController.getSummary);

// Graph nodes
graphRoutes.get('/:id/graph/nodes', GraphController.getNodes);

// Graph edges
graphRoutes.get('/:id/graph/edges', GraphController.getEdges);

// Graph path search
graphRoutes.get('/:id/graph/path', GraphController.findPath);

// Single node inspection
graphRoutes.get('/:id/graph/node/:nodeId', GraphController.getNodeDetails);

// Node neighborhood lookup
graphRoutes.get('/:id/graph/neighborhood/:nodeId', GraphController.getNeighborhood);
