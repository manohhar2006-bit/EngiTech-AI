import { WhyGraphData } from '../types/graph';

export const MOCK_HERO_GRAPH: WhyGraphData = {
  nodes: [
    {
      id: 'node-inc-01',
      type: 'INCIDENT',
      label: 'INCIDENT #402',
      sublabel: 'Redis Connection Timeout Outage',
      metadata: { severity: 'CRITICAL', date: '2024-11-12', description: 'DB connection pool exhausted during peak sale.' }
    },
    {
      id: 'node-dec-01',
      type: 'DECISION',
      label: 'ADR-042',
      sublabel: 'Introduce Redis Cache Layer',
      metadata: { debtScore: 24, author: 'Alex Rivera', date: '2024-11-14', description: 'Bypassed PostgreSQL for read hot paths to prevent pool lock.' }
    },
    {
      id: 'node-cmt-01',
      type: 'COMMIT',
      label: 'commit #8af42d',
      sublabel: 'feat(cache): add Redis caching wrapper',
      metadata: { hash: '8af42d91', author: 'Alex Rivera', date: '2024-11-15' }
    },
    {
      id: 'node-file-01',
      type: 'FILE',
      label: 'PaymentService.ts',
      sublabel: 'src/services/PaymentService.ts',
      metadata: { path: 'src/services/PaymentService.ts' }
    },
    {
      id: 'node-fn-01',
      type: 'FUNCTION',
      label: 'verifyTransaction()',
      sublabel: 'PaymentService.ts',
      metadata: { description: 'Cached verification routine with 300s TTL' }
    },
    {
      id: 'node-dep-01',
      type: 'DEPENDENCY',
      label: 'ioredis v5.3.0',
      sublabel: 'package.json',
      metadata: { version: 'v5.3.0', description: 'Redis client library' }
    },
    {
      id: 'node-iss-01',
      type: 'ISSUE',
      label: 'ISSUE #142',
      sublabel: 'DB Pool Exhaustion in Peak Checkout',
      metadata: { date: '2024-11-13' }
    },
    {
      id: 'node-aut-01',
      type: 'AUTHOR',
      label: 'Alex Rivera',
      sublabel: 'Staff Infra Engineer',
      metadata: { author: 'Alex Rivera' }
    },
    {
      id: 'node-dec-02',
      type: 'DECISION',
      label: 'ADR-089',
      sublabel: 'Migrate Auth to JWT Stateless Tokens',
      metadata: { debtScore: 68, author: 'Elena Rostova', date: '2025-03-22', description: 'Stateless JWT auth introduced to bypass session store bottleneck.' }
    },
    {
      id: 'node-cmt-02',
      type: 'COMMIT',
      label: 'commit #4c11ae',
      sublabel: 'refactor(auth): introduce JWT validation',
      metadata: { hash: '4c11ae88', author: 'Elena Rostova', date: '2025-03-24' }
    },
    {
      id: 'node-file-02',
      type: 'FILE',
      label: 'AuthMiddleware.ts',
      sublabel: 'src/middleware/AuthMiddleware.ts',
      metadata: { path: 'src/middleware/AuthMiddleware.ts' }
    },
    {
      id: 'node-inc-02',
      type: 'INCIDENT',
      label: 'INCIDENT #518',
      sublabel: 'Stale Token Revocation Vulnerability',
      metadata: { severity: 'HIGH', date: '2025-08-10', description: 'Inability to revoke compromise JWT without global secret rotation.' }
    }
  ],
  edges: [
    { id: 'e1', source: 'node-inc-01', target: 'node-iss-01', label: 'RAISED_ISSUE', relationshipType: 'RAISED_ISSUE' },
    { id: 'e2', source: 'node-iss-01', target: 'node-dec-01', label: 'MOTIVATED', relationshipType: 'MOTIVATED' },
    { id: 'e3', source: 'node-aut-01', target: 'node-dec-01', label: 'DECIDED', relationshipType: 'DECIDED' },
    { id: 'e4', source: 'node-dec-01', target: 'node-cmt-01', label: 'IMPLEMENTED_BY', relationshipType: 'IMPLEMENTED_BY' },
    { id: 'e5', source: 'node-cmt-01', target: 'node-file-01', label: 'MODIFIED', relationshipType: 'MODIFIED' },
    { id: 'e6', source: 'node-file-01', target: 'node-fn-01', label: 'CONTAINS', relationshipType: 'CONTAINS' },
    { id: 'e7', source: 'node-file-01', target: 'node-dep-01', label: 'DEPENDS_ON', relationshipType: 'DEPENDS_ON' },
    { id: 'e8', source: 'node-dec-02', target: 'node-cmt-02', label: 'IMPLEMENTED_BY', relationshipType: 'IMPLEMENTED_BY' },
    { id: 'e9', source: 'node-cmt-02', target: 'node-file-02', label: 'MODIFIED', relationshipType: 'MODIFIED' },
    { id: 'e10', source: 'node-file-02', target: 'node-inc-02', label: 'TRIGGERED_BY', relationshipType: 'TRIGGERED_BY' },
    { id: 'e11', source: 'node-dec-01', target: 'node-dec-02', label: 'EVOLVED_TO', relationshipType: 'EVOLVED_TO' },
    // Commit parent chain for HISTORY mode (node-cmt-01 is parent of node-cmt-02)
    { id: 'e-parent-01', source: 'node-cmt-01', target: 'node-cmt-02', label: 'PARENT_OF', relationshipType: 'PARENT_OF', classification: 'FACT', confidence: 1.0 }
  ]
};
