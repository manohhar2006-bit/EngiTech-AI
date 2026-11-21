/**
 * EngiTrace Engineering Memory Graph API Controller
 */

import { Request, Response } from 'express';
import { GraphRepository } from '../services/graphRepository';

export class GraphController {
  /**
   * GET /api/v1/repositories/:id/graph
   */
  static getGraph(req: Request, res: Response): void {
    const { id } = req.params;
    const graph = GraphRepository.getGraph(id);

    if (!graph) {
      res.status(404).json({ error: `Engineering Memory Graph for repository "${id}" not found. Please analyze repository first.` });
      return;
    }

    res.json(graph);
  }

  /**
   * GET /api/v1/repositories/:id/graph/nodes
   */
  static getNodes(req: Request, res: Response): void {
    const { id } = req.params;
    const typeFilter = req.query.type as string | undefined;

    const graph = GraphRepository.getGraph(id);
    if (!graph) {
      res.status(404).json({ error: `Repository "${id}" not found.` });
      return;
    }

    const nodes = GraphRepository.getNodes(id, typeFilter);
    res.json({ total: nodes.length, nodes });
  }

  /**
   * GET /api/v1/repositories/:id/graph/edges
   */
  static getEdges(req: Request, res: Response): void {
    const { id } = req.params;
    const graph = GraphRepository.getGraph(id);

    if (!graph) {
      res.status(404).json({ error: `Repository "${id}" not found.` });
      return;
    }

    const edges = GraphRepository.getEdges(id);
    res.json({ total: edges.length, edges });
  }

  /**
   * GET /api/v1/repositories/:id/graph/node/:nodeId
   */
  static getNodeDetails(req: Request, res: Response): void {
    const { id, nodeId } = req.params;
    const node = GraphRepository.getNode(id, nodeId);

    if (!node) {
      res.status(404).json({ error: `Node "${nodeId}" not found in repository graph.` });
      return;
    }

    const neighborhood = GraphRepository.getNeighborhood(id, nodeId, 1);

    res.json({
      node,
      connectedEdges: neighborhood.edges,
      connectedNodes: neighborhood.nodes.filter((n) => n.id !== nodeId)
    });
  }

  /**
   * GET /api/v1/repositories/:id/graph/neighborhood/:nodeId
   */
  static getNeighborhood(req: Request, res: Response): void {
    const { id, nodeId } = req.params;
    const depthParam = req.query.depth as string | undefined;
    const depth = depthParam ? parseInt(depthParam, 10) : 1;

    const neighborhood = GraphRepository.getNeighborhood(id, nodeId, depth);

    if (!neighborhood.targetNode) {
      res.status(404).json({ error: `Node "${nodeId}" not found.` });
      return;
    }

    res.json(neighborhood);
  }

  /**
   * GET /api/v1/repositories/:id/graph/summary
   */
  static getSummary(req: Request, res: Response): void {
    const { id } = req.params;
    const summary = GraphRepository.getSummary(id);

    if (!summary) {
      res.status(404).json({ error: `Graph summary for "${id}" not found.` });
      return;
    }

    res.json({ summary });
  }

  /**
   * GET /api/v1/repositories/:id/graph/path
   * Query params: source, target
   */
  static findPath(req: Request, res: Response): void {
    const { id } = req.params;
    const source = req.query.source as string;
    const target = req.query.target as string;

    if (!source || !target) {
      res.status(400).json({ error: 'Both "source" and "target" query parameters are required.' });
      return;
    }

    const result = GraphRepository.findPath(id, source, target);
    res.json(result);
  }
}
