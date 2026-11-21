/**
 * EngiTrace Graph Navigation Service
 * 
 * Manages context-preserving navigation between Engineering Graph views and
 * the dedicated EngiTrace AI Assistant workspace. Captures, persists, validates,
 * and restores repository, view mode, selected node, search filter, and viewport state.
 */

import { GraphNode } from '../types/graph';

export type GraphView = 'git_graph' | 'architecture' | 'dependencies' | 'decisions';

export interface GraphOriginContext {
  repoId: string;
  repoName?: string;
  view: GraphView;
  nodeId?: string;
  nodeType?: string;
  nodeLabel?: string;
  nodePath?: string;
  searchQuery?: string;
  timestamp: number;
}

const STORAGE_KEY_PREFIX = 'engitrace_graph_origin_';
const LATEST_ORIGIN_KEY = 'engitrace_latest_graph_origin';

export class GraphNavigationService {
  /**
   * Normalizes any raw view string into one of the four supported Engineering Graph views.
   */
  static normalizeView(rawView?: string | null): GraphView {
    if (!rawView) return 'architecture';
    const upper = rawView.trim().toUpperCase();

    if (upper === 'DEPENDENCIES' || upper === 'DEPENDENCY') {
      return 'dependencies';
    }
    if (upper === 'DECISIONS' || upper === 'DECISION' || upper === 'RATIONALE') {
      return 'decisions';
    }
    if (upper === 'GIT_GRAPH' || upper === 'GIT' || upper === 'TIMELINE' || upper === 'HISTORY') {
      return 'git_graph';
    }
    if (upper === 'ARCHITECTURE') {
      return 'architecture';
    }
    return 'architecture';
  }

  /**
   * Maps an entity node type to its most natural initial graph view.
   */
  static getDefaultViewForNodeType(type?: string): GraphView {
    if (!type) return 'architecture';
    const upper = type.toUpperCase();
    if (upper === 'DEPENDENCY') return 'dependencies';
    if (upper === 'DECISION' || upper === 'INCIDENT') return 'decisions';
    if (upper === 'COMMIT') return 'git_graph';
    return 'architecture';
  }

  /**
   * Safely captures and persists originating graph context into session storage.
   */
  static saveGraphOrigin(context: GraphOriginContext): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      const serialized = JSON.stringify(context);
      window.sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${context.repoId}`, serialized);
      window.sessionStorage.setItem(LATEST_ORIGIN_KEY, serialized);
    } catch (err) {
      console.warn('[GraphNavigationService] Failed to persist graph origin:', err);
    }
  }

  /**
   * Retrieves saved originating context for a specific repository, or the latest available.
   */
  static getGraphOrigin(repoId?: string | null): GraphOriginContext | null {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    try {
      if (repoId) {
        const item = window.sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${repoId}`);
        if (item) return JSON.parse(item);
      }
      const latest = window.sessionStorage.getItem(LATEST_ORIGIN_KEY);
      if (latest) {
        const parsed: GraphOriginContext = JSON.parse(latest);
        if (!repoId || parsed.repoId === repoId) return parsed;
      }
    } catch (err) {
      console.warn('[GraphNavigationService] Failed to retrieve graph origin:', err);
    }
    return null;
  }

  /**
   * Invalidates and clears stored origin context.
   */
  static clearGraphOrigin(repoId?: string | null): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      if (repoId) {
        window.sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${repoId}`);
      }
      window.sessionStorage.removeItem(LATEST_ORIGIN_KEY);
    } catch { }
  }

  /**
   * Validates that a route is a safe internal EngiTrace path and prevents arbitrary open redirects.
   */
  static isSafeInternalRoute(path: string): boolean {
    if (!path || typeof path !== 'string') return false;
    // Must start with '/' and not with '//' or contain protocol schemes
    if (!path.startsWith('/') || path.startsWith('//')) return false;
    if (path.includes('://') || path.startsWith('javascript:')) return false;

    const base = path.split('?')[0];
    const allowedPrefixes = ['/whygraph', '/ai-assistant', '/repository', '/dashboard', '/decision-debt', '/docs'];
    return allowedPrefixes.some((prefix) => base === prefix || base.startsWith(`${prefix}/`));
  }

  /**
   * Constructs the URL for launching an AI investigation while preserving all graph context.
   */
  static buildAIAssistantUrl(params: {
    repoId: string;
    node?: GraphNode | null;
    mode: 'WHY' | 'WHAT_IF' | 'GENERAL';
    view: string;
    searchQuery?: string;
    question: string;
    repoName?: string;
  }): string {
    const searchParams = new URLSearchParams();
    searchParams.set('repo', params.repoId);

    if (params.node) {
      searchParams.set('node', params.node.id);
    }

    searchParams.set('mode', params.mode);
    searchParams.set('origin', 'graph');
    searchParams.set('view', this.normalizeView(params.view));

    if (params.searchQuery && params.searchQuery.trim()) {
      searchParams.set('search', params.searchQuery.trim());
    }

    searchParams.set('question', params.question);

    return `/ai-assistant?${searchParams.toString()}`;
  }

  /**
   * Constructs the exact return URL restoring the originating graph view, repository, and node.
   */
  static buildReturnToGraphUrl(origin: {
    repoId?: string | null;
    view?: string | null;
    nodeId?: string | null;
    sessionId?: string | null;
    searchQuery?: string | null;
    fallbackView?: GraphView;
  }): string {
    const repoId = origin.repoId?.trim();
    if (!repoId) {
      // Safe fallback if no repository is configured
      return '/repository';
    }

    const normalizedView = this.normalizeView(origin.view || origin.fallbackView || 'architecture');
    const searchParams = new URLSearchParams();
    searchParams.set('view', normalizedView);
    searchParams.set('repo', repoId);

    if (origin.nodeId && origin.nodeId.trim()) {
      searchParams.set('nodeId', origin.nodeId.trim());
    }

    if (origin.sessionId && origin.sessionId.trim()) {
      searchParams.set('session', origin.sessionId.trim());
    }

    if (origin.searchQuery && origin.searchQuery.trim()) {
      searchParams.set('search', origin.searchQuery.trim());
    }

    const returnUrl = `/whygraph?${searchParams.toString()}`;
    return this.isSafeInternalRoute(returnUrl) ? returnUrl : `/whygraph?repo=${encodeURIComponent(repoId)}`;
  }
}

