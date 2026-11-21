import { RepositoryStats } from '../types/graph';

export const MOCK_REPOSITORIES: RepositoryStats[] = [
  {
    id: 'repo-01',
    name: 'codeorigin/engineering-core',
    organization: 'EngiTrace Inc',
    stars: 1240,
    forks: 185,
    totalCommits: 4850,
    totalNodes: 12420,
    decisionDebtScore: 28,
    lastAnalyzed: '10 minutes ago',
    healthStatus: 'MODERATE_DEBT'
  },
  {
    id: 'repo-02',
    name: 'codeorigin/payment-gateway',
    organization: 'EngiTrace Inc',
    stars: 840,
    forks: 92,
    totalCommits: 2310,
    totalNodes: 5890,
    decisionDebtScore: 74,
    lastAnalyzed: '2 hours ago',
    healthStatus: 'HIGH_RISK'
  },
  {
    id: 'repo-03',
    name: 'codeorigin/auth-service',
    organization: 'EngiTrace Inc',
    stars: 560,
    forks: 41,
    totalCommits: 1420,
    totalNodes: 3120,
    decisionDebtScore: 12,
    lastAnalyzed: '1 day ago',
    healthStatus: 'HEALTHY'
  }
];
