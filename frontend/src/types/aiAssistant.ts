import { GraphNode } from './graph';
import type { GraphOriginContext } from '../services/graphNavigationService';


export type InvestigationMode = 'WHY' | 'WHAT_IF' | 'GENERAL';

export interface InvestigationContext {
  repositoryId: string;
  repositoryName: string;
  targetNode: GraphNode | null;
  targetLabel: string;
  topic: string;
  mode: InvestigationMode;
}

export interface EvidenceClaim {
  id?: string;
  text: string;
  classification: 'FACT' | 'INFERENCE' | 'UNKNOWN';
  evidenceIds?: string[];
  confidence?: number;
  reasoning?: string;
  sourceUrls?: string[];
}

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  claims?: EvidenceClaim[];
  suggestedFollowUps?: string[];
  provider?: string;
  model?: string;
  isFallback?: boolean;
  isError?: boolean;
}

export interface GroupedEvidence {
  commits: Array<{
    id: string;
    hash?: string;
    shortHash?: string;
    message: string;
    authorName?: string;
    date?: string;
    url?: string;
  }>;
  pullRequests: Array<{
    id: number | string;
    number: number;
    title: string;
    author?: string;
    state?: string;
    url?: string;
  }>;
  issues: Array<{
    id: number | string;
    number: number;
    title: string;
    author?: string;
    state?: string;
    url?: string;
  }>;
  files: Array<{
    path: string;
    size?: number;
    extension?: string;
  }>;
  evidenceRecords: Array<{
    id: string;
    title: string;
    description: string;
    classification: 'FACT' | 'INFERENCE' | 'UNKNOWN';
    sourceUrl?: string;
    timestamp?: string;
    relationshipType?: string;
  }>;
}

export interface InvestigationSession {
  id: string;

  repositoryId: string;
  repositoryName?: string;

  targetNodeId?: string;
  targetNodeLabel?: string;
  targetNodeType?: string;
  targetFilePath?: string;
  targetNodeMetadata?: Record<string, any>;

  investigationMode: InvestigationMode;
  investigationTopic: string;
  initialQuestion?: string;

  messages: AssistantChatMessage[];

  suggestedQuestions?: string[];

  originContext?: GraphOriginContext | null;

  nodeNotFound?: string | null;

  createdAt: string;
  updatedAt: string;

  status: 'active' | 'archived';
}

export interface CreateSessionParams {
  id?: string;
  repositoryId: string;
  repositoryName?: string;
  targetNodeId?: string;
  targetNodeLabel?: string;
  targetNodeType?: string;
  targetFilePath?: string;
  targetNodeMetadata?: Record<string, any>;
  investigationMode?: InvestigationMode;
  investigationTopic?: string;
  initialQuestion?: string;
  messages?: AssistantChatMessage[];
  suggestedQuestions?: string[];
  originContext?: InvestigationSession['originContext'];
  nodeNotFound?: string | null;
  status?: 'active' | 'archived';
}


