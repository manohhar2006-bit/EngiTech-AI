import { ApiService } from './apiService';
import { GraphService } from './graphService';
import { FrontendDecisionDebtService } from './decisionDebtService';
import {
  WorkspaceDashboardData,
  WorkspaceMetrics,
  WorkspaceRepositoryItem,
  WorkspaceActivityItem,
  RepositoryAnalysisStatus
} from '../types/workspaceDashboard';
import { DashboardData } from '../types/graph';

export class DashboardService {
  /**
   * Fetch complete Workspace-Level Dashboard dataset aggregating across ALL connected repositories.
   */
  static async fetchWorkspaceDashboardData(): Promise<WorkspaceDashboardData> {
    try {
      const repos = await ApiService.fetchRepositories();

      if (!repos || repos.length === 0) {
        return this.getEmptyWorkspaceData();
      }

      // Fetch repository details, commits, issues, debts, dependencies, and evidence across all repos in parallel
      const repoDetailsPromises = repos.map(async (r) => {
        const repoId = r.repository.id;
        try {
          const [commitsRes, issuesRes, debtRes, depNodesRes, evidenceRes] = await Promise.allSettled([
            ApiService.fetchCommits(repoId),
            ApiService.fetchIssues(repoId),
            FrontendDecisionDebtService.fetchRepositoryDebt(repoId),
            GraphService.fetchNodesByType(repoId, 'DEPENDENCY'),
            ApiService.fetchEvidence(repoId)
          ]);

          const commits = commitsRes.status === 'fulfilled' ? commitsRes.value : [];
          const issuesAndPrs = issuesRes.status === 'fulfilled' ? issuesRes.value : { issues: [], pullRequests: [] };
          const debt = debtRes.status === 'fulfilled' ? debtRes.value : null;
          const depNodes = depNodesRes.status === 'fulfilled' ? depNodesRes.value : [];
          const evidence = evidenceRes.status === 'fulfilled' ? evidenceRes.value : [];

          return {
            summary: r,
            commits,
            issuesAndPrs,
            debt,
            depNodes,
            evidence
          };
        } catch (err) {
          console.warn(`[DashboardService] Error fetching details for repository ${repoId}:`, err);
          return {
            summary: r,
            commits: r.recentCommits || [],
            issuesAndPrs: { issues: [], pullRequests: [] },
            debt: null,
            depNodes: [],
            evidence: []
          };
        }
      });

      const repoResults = await Promise.all(repoDetailsPromises);

      // Aggregators
      const allActivities: WorkspaceActivityItem[] = [];
      const allCommitHashes = new Set<string>();
      const allUniquePackages = new Set<string>();
      const packageRepoCounts = new Map<string, number>();
      const ecosystemCounts = new Map<string, number>();

      let totalCommitsAnalyzed = 0;
      let totalDependenciesCount = 0;
      let totalEvidenceRecords = 0;
      let factCount = 0;
      let inferenceCount = 0;
      let unknownCount = 0;

      let totalDecisionDebtFindings = 0;
      let affectedComponentsCount = 0;
      let affectedRepositoriesCount = 0;
      const severityBreakdown = { HIGH: 0, MEDIUM: 0, LOW: 0, CRITICAL: 0 };
      const allDebtComponents: Array<{
        repoName: string;
        componentLabel: string;
        score: number;
        level: string;
        explanation: string;
        signalsCount: number;
      }> = [];

      let analyzedRepositories = 0;
      let pendingRepositories = 0;

      const workspaceRepositories: WorkspaceRepositoryItem[] = [];

      repoResults.forEach(({ summary: r, commits, issuesAndPrs, debt, depNodes, evidence }) => {
        const repoMeta = r.repository;
        const isAnalyzed = Boolean(r.analyzedAt);

        if (isAnalyzed) {
          analyzedRepositories++;
        } else {
          pendingRepositories++;
        }

        totalCommitsAnalyzed += r.totalCommits || commits.length || 0;
        totalDependenciesCount += r.totalDependencies || depNodes.length || 0;
        totalEvidenceRecords += r.totalEvidenceRecords || evidence.length || 0;
        factCount += r.factCount || evidence.filter((e) => e.classification === 'FACT').length || 0;
        inferenceCount += r.inferenceCount || evidence.filter((e) => e.classification === 'INFERENCE').length || 0;
        unknownCount += r.unknownCount || evidence.filter((e) => e.classification === 'UNKNOWN').length || 0;

        // Commits tracking & activity mapping
        commits.forEach((c) => {
          const hashKey = c.hash || c.shortHash;
          if (hashKey) allCommitHashes.add(hashKey);

          allActivities.push({
            id: hashKey || `c-${Math.random()}`,
            repositoryId: repoMeta.id,
            repositoryName: repoMeta.name,
            type: 'COMMIT',
            title: c.message ? c.message.split('\n')[0] : 'Commit without message',
            description: `Commit ${c.shortHash || (c.hash ? c.hash.substring(0, 7) : '')} by ${c.authorName}`,
            author: c.authorName || 'Unknown',
            timestamp: c.date || r.analyzedAt || new Date().toISOString(),
            sourceUrl: c.url,
            nodeId: `commit:${c.shortHash || (c.hash ? c.hash.substring(0, 7) : '')}`
          });
        });

        // PRs activity mapping
        (issuesAndPrs.pullRequests || []).forEach((pr) => {
          allActivities.push({
            id: `pr-${repoMeta.id}-${pr.number}`,
            repositoryId: repoMeta.id,
            repositoryName: repoMeta.name,
            type: 'PULL_REQUEST',
            title: `PR #${pr.number}: ${pr.title}`,
            description: `PR #${pr.number} (${pr.state}) by ${pr.author}`,
            author: pr.author || 'Contributor',
            timestamp: pr.createdAt || r.analyzedAt || new Date().toISOString(),
            sourceUrl: pr.url,
            status: pr.state,
            nodeId: `pr:${pr.number}`
          });
        });

        // Issues activity mapping
        (issuesAndPrs.issues || []).forEach((issue) => {
          allActivities.push({
            id: `issue-${repoMeta.id}-${issue.number}`,
            repositoryId: repoMeta.id,
            repositoryName: repoMeta.name,
            type: 'ISSUE',
            title: `Issue #${issue.number}: ${issue.title}`,
            description: `Issue #${issue.number} (${issue.state}) by ${issue.author}`,
            author: issue.author || 'Reporter',
            timestamp: issue.createdAt || r.analyzedAt || new Date().toISOString(),
            sourceUrl: issue.url,
            status: issue.state,
            nodeId: `issue:${issue.number}`
          });
        });

        // Dependency tracking
        const repoPackages = new Set<string>();
        depNodes.forEach((node) => {
          const pkgName = node.label.toLowerCase();
          allUniquePackages.add(pkgName);
          repoPackages.add(pkgName);

          const eco = (node.metadata?.ecosystem as string) || (repoMeta.language ? repoMeta.language.toLowerCase() : 'npm');
          ecosystemCounts.set(eco, (ecosystemCounts.get(eco) || 0) + 1);
        });

        repoPackages.forEach((pkg) => {
          packageRepoCounts.set(pkg, (packageRepoCounts.get(pkg) || 0) + 1);
        });

        // Decision Debt tracking
        const debtComponents = debt?.topDebtComponents || [];
        const hasDebtRisk = debtComponents.some((d) => d.level === 'HIGH' || d.level === 'CRITICAL') || (debt?.overallScore || 0) >= 60;

        let repoStatus: RepositoryAnalysisStatus = 'READY';
        if (!isAnalyzed) {
          repoStatus = 'NOT_ANALYZED';
        } else if (hasDebtRisk) {
          repoStatus = 'NEEDS_ATTENTION';
        }

        if (debt) {
          let repoSignalsCount = 0;
          debtComponents.forEach((c) => {
            const sigs = c.signals?.length || (c.level === 'HIGH' ? 3 : c.level === 'MEDIUM' ? 2 : 1);
            repoSignalsCount += sigs;
            allDebtComponents.push({
              repoName: repoMeta.name,
              componentLabel: c.targetNodeLabel || c.targetNodeId,
              score: c.score,
              level: c.level,
              explanation: c.explanation,
              signalsCount: sigs
            });
          });

          totalDecisionDebtFindings += repoSignalsCount;
          affectedComponentsCount += debtComponents.length;
          if (repoSignalsCount > 0 || (debt.overallScore || 0) > 30) {
            affectedRepositoriesCount++;
          }

          if (debt.breakdown) {
            severityBreakdown.HIGH += debt.breakdown.HIGH || 0;
            severityBreakdown.MEDIUM += debt.breakdown.MEDIUM || 0;
            severityBreakdown.LOW += debt.breakdown.LOW || 0;
          } else {
            debtComponents.forEach((c) => {
              if (c.level === 'HIGH') severityBreakdown.HIGH++;
              else if (c.level === 'MEDIUM') severityBreakdown.MEDIUM++;
              else severityBreakdown.LOW++;
            });
          }
        }

        workspaceRepositories.push({
          id: repoMeta.id,
          name: repoMeta.name,
          owner: repoMeta.owner,
          repo: repoMeta.repo,
          url: repoMeta.url,
          defaultBranch: repoMeta.defaultBranch || 'main',
          language: repoMeta.language,
          commitsCount: r.totalCommits || commits.length || 0,
          filesCount: r.totalFiles || 0,
          dependenciesCount: r.totalDependencies || depNodes.length || 0,
          evidenceCount: r.totalEvidenceRecords || evidence.length || 0,
          analyzedAt: r.analyzedAt,
          status: repoStatus,
          debtScore: debt?.overallScore || 0,
          debtLevel: (debt?.overallLevel as any) || 'LOW',
          criticalFindingsCount: debtComponents.filter((d) => d.level === 'HIGH' || d.level === 'CRITICAL').length
        });
      });

      // Sort recent activities chronologically descending
      allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Sort debt components by score descending
      allDebtComponents.sort((a, b) => b.score - a.score);
      const topDebtComponent = allDebtComponents[0];

      // Top ecosystems sorted
      const topEcosystems = Array.from(ecosystemCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Top packages sorted
      const topPackages = Array.from(packageRepoCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      const evidenceCoverage =
        totalEvidenceRecords > 0
          ? Math.round(((factCount + inferenceCount) / totalEvidenceRecords) * 100) / 100
          : 1.0;

      const metrics: WorkspaceMetrics = {
        totalRepositories: repos.length,
        analyzedRepositories,
        pendingRepositories,
        failedRepositories: 0,
        totalCommitsAnalyzed,
        uniqueCommitsCount: allCommitHashes.size > 0 ? allCommitHashes.size : totalCommitsAnalyzed,
        totalDependenciesCount,
        uniquePackagesCount: allUniquePackages.size > 0 ? allUniquePackages.size : totalDependenciesCount,
        totalDecisionDebtFindings,
        affectedComponentsCount,
        affectedRepositoriesCount,
        severityBreakdown,
        totalEvidenceRecords,
        factCount,
        inferenceCount,
        unknownCount,
        evidenceCoverage
      };

      return {
        metrics,
        repositories: workspaceRepositories,
        recentActivities: allActivities,
        decisionDebtInsight: {
          totalFindings: totalDecisionDebtFindings,
          affectedReposCount: affectedRepositoriesCount,
          highCount: severityBreakdown.HIGH,
          mediumCount: severityBreakdown.MEDIUM,
          lowCount: severityBreakdown.LOW,
          topDebtComponent,
          summaryText: topDebtComponent
            ? `Top maintenance risk: "${topDebtComponent.componentLabel}" in ${topDebtComponent.repoName} (Score: ${topDebtComponent.score}/100). ${topDebtComponent.explanation}`
            : affectedRepositoriesCount > 0
            ? `${totalDecisionDebtFindings} architectural findings detected across ${affectedRepositoriesCount} repositories.`
            : 'All analyzed repositories show low architectural drift with grounded rationale trails.'
        },
        dependencyInsight: {
          uniquePackagesCount: metrics.uniquePackagesCount,
          totalDeclarations: totalDependenciesCount,
          topEcosystems,
          topPackages,
          summaryText:
            metrics.uniquePackagesCount > 0
              ? `${metrics.uniquePackagesCount} unique external packages identified across ${totalDependenciesCount} manifest declarations.`
              : 'Indexed manifest package dependencies integrated into workspace memory.'
        },
        historicalInsight: {
          totalEvidence: totalEvidenceRecords,
          factCount,
          inferenceCount,
          unknownCount,
          coveragePercentage: Math.round(evidenceCoverage * 100),
          summaryText:
            totalEvidenceRecords > 0
              ? `Multi-hop historical reasoning connecting commits, pull requests, issues, and code changes with ${Math.round(evidenceCoverage * 100)}% verified evidence coverage.`
              : 'Evidence-grounded explanations connecting commits, issues, and PRs.'
        },
        isDemo: false
      };
    } catch (err) {
      console.warn('[DashboardService] Live workspace data fetch failed, using fallback demo dataset:', err);
      return this.getDemoWorkspaceData();
    }
  }

  /**
   * Honest empty state when no repositories are connected.
   */
  static getEmptyWorkspaceData(): WorkspaceDashboardData {
    return {
      metrics: {
        totalRepositories: 0,
        analyzedRepositories: 0,
        pendingRepositories: 0,
        failedRepositories: 0,
        totalCommitsAnalyzed: 0,
        uniqueCommitsCount: 0,
        totalDependenciesCount: 0,
        uniquePackagesCount: 0,
        totalDecisionDebtFindings: 0,
        affectedComponentsCount: 0,
        affectedRepositoriesCount: 0,
        severityBreakdown: { HIGH: 0, MEDIUM: 0, LOW: 0, CRITICAL: 0 },
        totalEvidenceRecords: 0,
        factCount: 0,
        inferenceCount: 0,
        unknownCount: 0,
        evidenceCoverage: 1.0
      },
      repositories: [],
      recentActivities: [],
      decisionDebtInsight: {
        totalFindings: 0,
        affectedReposCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        summaryText: 'Connect GitHub repositories to assess workspace decision debt and architectural drift.'
      },
      dependencyInsight: {
        uniquePackagesCount: 0,
        totalDeclarations: 0,
        topEcosystems: [],
        topPackages: [],
        summaryText: 'No manifest dependencies available. Connect repositories to map package ecosystems.'
      },
      historicalInsight: {
        totalEvidence: 0,
        factCount: 0,
        inferenceCount: 0,
        unknownCount: 0,
        coveragePercentage: 100,
        summaryText: 'Connect your first GitHub repository to begin constructing historical evidence.'
      },
      isDemo: false
    };
  }

  /**
   * Demo workspace dataset for offline visual review or initial sandbox preview.
   * Clearly marked with `isDemo: true`.
   */
  static getDemoWorkspaceData(): WorkspaceDashboardData {
    return {
      metrics: {
        totalRepositories: 3,
        analyzedRepositories: 3,
        pendingRepositories: 0,
        failedRepositories: 0,
        totalCommitsAnalyzed: 218,
        uniqueCommitsCount: 218,
        totalDependenciesCount: 36,
        uniquePackagesCount: 28,
        totalDecisionDebtFindings: 14,
        affectedComponentsCount: 6,
        affectedRepositoriesCount: 2,
        severityBreakdown: { HIGH: 4, MEDIUM: 6, LOW: 4, CRITICAL: 0 },
        totalEvidenceRecords: 5128,
        factCount: 3820,
        inferenceCount: 1180,
        unknownCount: 128,
        evidenceCoverage: 0.98
      },
      repositories: [
        {
          id: 'repo-facebook-react',
          name: 'facebook/react',
          owner: 'facebook',
          repo: 'react',
          url: 'https://github.com/facebook/react',
          defaultBranch: 'main',
          language: 'JavaScript',
          commitsCount: 142,
          filesCount: 420,
          dependenciesCount: 12,
          evidenceCount: 3841,
          analyzedAt: new Date(Date.now() - 3600000).toISOString(),
          status: 'READY',
          debtScore: 24,
          debtLevel: 'LOW',
          criticalFindingsCount: 0
        },
        {
          id: 'repo-codeorigin-core',
          name: 'codeorigin/engineering-core',
          owner: 'codeorigin',
          repo: 'engineering-core',
          url: 'https://github.com/codeorigin/engineering-core',
          defaultBranch: 'main',
          language: 'TypeScript',
          commitsCount: 52,
          filesCount: 180,
          dependenciesCount: 16,
          evidenceCount: 91,
          analyzedAt: new Date(Date.now() - 600000).toISOString(),
          status: 'READY',
          debtScore: 32,
          debtLevel: 'LOW',
          criticalFindingsCount: 0
        },
        {
          id: 'repo-payment-gateway',
          name: 'codeorigin/payment-gateway',
          owner: 'codeorigin',
          repo: 'payment-gateway',
          url: 'https://github.com/codeorigin/payment-gateway',
          defaultBranch: 'main',
          language: 'TypeScript',
          commitsCount: 24,
          filesCount: 96,
          dependenciesCount: 8,
          evidenceCount: 37,
          analyzedAt: new Date(Date.now() - 7200000).toISOString(),
          status: 'NEEDS_ATTENTION',
          debtScore: 78,
          debtLevel: 'HIGH',
          criticalFindingsCount: 2
        }
      ],
      recentActivities: [
        {
          id: '3f901a88',
          repositoryId: 'repo-codeorigin-core',
          repositoryName: 'codeorigin/engineering-core',
          type: 'COMMIT',
          title: 'feat(graph): introduce multi-hop neighborhood query engine',
          description: 'Commit #3f901a8 by Elena Rostova',
          author: 'Elena Rostova',
          timestamp: new Date(Date.now() - 600000).toISOString(),
          sourceUrl: 'https://github.com/codeorigin/engineering-core/commit/3f901a8820194817',
          nodeId: 'commit:3f901a8'
        },
        {
          id: '8af42d91',
          repositoryId: 'repo-facebook-react',
          repositoryName: 'facebook/react',
          type: 'COMMIT',
          title: 'fix(renderer): resolve reconciliation timeout on large fiber trees (#142)',
          description: 'Commit #8af42d9 by Sophie Alpert',
          author: 'Sophie Alpert',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          sourceUrl: 'https://github.com/facebook/react/commit/8af42d9102938475',
          nodeId: 'commit:8af42d9'
        },
        {
          id: 'pr-facebook-react-145',
          repositoryId: 'repo-facebook-react',
          repositoryName: 'facebook/react',
          type: 'PULL_REQUEST',
          title: 'PR #145: Compiler auto-memoization pass for inline JSX',
          description: 'PR #145 (merged) by Andrew Clark',
          author: 'Andrew Clark',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          sourceUrl: 'https://github.com/facebook/react/pull/145',
          status: 'merged',
          nodeId: 'pr:145'
        },
        {
          id: '5a110293',
          repositoryId: 'repo-payment-gateway',
          repositoryName: 'codeorigin/payment-gateway',
          type: 'COMMIT',
          title: 'fix(cache): add Redis caching wrapper to prevent DB lock (#142)',
          description: 'Commit #5a11029 by Alex Rivera',
          author: 'Alex Rivera',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          sourceUrl: 'https://github.com/codeorigin/payment-gateway/commit/5a11029384759f12',
          nodeId: 'commit:5a11029'
        },
        {
          id: 'issue-facebook-react-142',
          repositoryId: 'repo-facebook-react',
          repositoryName: 'facebook/react',
          type: 'ISSUE',
          title: 'Issue #142: Concurrent scheduler priority inversion under heavy fiber loads',
          description: 'Issue #142 (closed) by Sebastian Markbåge',
          author: 'Sebastian Markbåge',
          timestamp: new Date(Date.now() - 14400000).toISOString(),
          sourceUrl: 'https://github.com/facebook/react/issues/142',
          status: 'closed',
          nodeId: 'issue:142'
        }
      ],
      decisionDebtInsight: {
        totalFindings: 14,
        affectedReposCount: 2,
        highCount: 4,
        mediumCount: 6,
        lowCount: 4,
        topDebtComponent: {
          repoName: 'codeorigin/payment-gateway',
          componentLabel: 'PaymentService.ts',
          score: 85,
          level: 'HIGH',
          explanation: 'Missing explicit rationale for Redis caching fallback mechanism introduced in commit #5a11029.',
          signalsCount: 3
        },
        summaryText:
          'Top maintenance risk: "PaymentService.ts" in codeorigin/payment-gateway (Score: 85/100). Missing explicit rationale for Redis caching fallback mechanism.'
      },
      dependencyInsight: {
        uniquePackagesCount: 28,
        totalDeclarations: 36,
        topEcosystems: [
          { name: 'npm', count: 24 },
          { name: 'typescript', count: 8 },
          { name: 'pypi', count: 4 }
        ],
        topPackages: [
          { name: 'typescript', count: 2 },
          { name: 'ioredis', count: 1 },
          { name: 'jsonwebtoken', count: 1 }
        ],
        summaryText: '28 unique external packages identified across 36 manifest declarations across TypeScript & JavaScript.'
      },
      historicalInsight: {
        totalEvidence: 5128,
        factCount: 3820,
        inferenceCount: 1180,
        unknownCount: 128,
        coveragePercentage: 98,
        summaryText:
          'Multi-hop historical reasoning connecting commits, pull requests, issues, and code changes with 98% verified evidence coverage.'
      },
      isDemo: true
    };
  }

  /**
   * Backwards-compatible single-repository fetcher (kept for legacy references).
   */
  static async fetchDashboardData(selectedRepositoryId?: string): Promise<DashboardData> {
    try {
      const repos = await ApiService.fetchRepositories();
      if (!repos || repos.length === 0) {
        return {
          repository: null,
          repositories: [],
          graphSummary: null,
          evidenceSummary: { totalRecords: 0, evidenceCoverage: 0, factCount: 0, inferenceCount: 0, unknownCount: 0 },
          whySummary: { reconstructablePercentage: 0, unknownRationaleCount: 0, lowConfidenceCount: 0 },
          decisionDebtSummary: { score: 0, level: 'INSUFFICIENT', highCount: 0, mediumCount: 0, lowCount: 0, topDebtComponents: [] },
          impactSummary: { highImpactCount: 0, mostConnectedCount: 0, topImpactComponents: [] },
          recentEvents: [],
          isDemo: false
        };
      }

      const activeSummary = selectedRepositoryId
        ? repos.find((r) => r.repository.id === selectedRepositoryId) || repos[0]
        : repos[0];
      const repoId = activeSummary.repository.id;

      const [gSum, dSum, evidenceRecords, fullGraph, fetchedCommits, issuesAndPrs] = await Promise.all([
        GraphService.fetchGraphSummary(repoId),
        FrontendDecisionDebtService.fetchRepositoryDebt(repoId),
        ApiService.fetchEvidence(repoId),
        GraphService.fetchGraph(repoId),
        ApiService.fetchCommits(repoId),
        ApiService.fetchIssues(repoId)
      ]);

      const repositoriesList = repos.map((r) => ({
        id: r.repository.id,
        name: r.repository.name,
        url: r.repository.url,
        analyzedAt: r.analyzedAt,
        totalCommits: r.totalCommits,
        totalEvidenceRecords: r.totalEvidenceRecords
      }));

      const factCount = activeSummary.factCount || evidenceRecords.filter((e) => e.classification === 'FACT').length;
      const inferenceCount = activeSummary.inferenceCount || evidenceRecords.filter((e) => e.classification === 'INFERENCE').length;
      const unknownCount = activeSummary.unknownCount || evidenceRecords.filter((e) => e.classification === 'UNKNOWN').length;
      const totalRecords = activeSummary.totalEvidenceRecords || evidenceRecords.length;
      const evidenceCoverage = dSum ? dSum.evidenceCoverage : totalRecords > 0 ? (factCount + inferenceCount) / totalRecords : 1.0;

      const recentEvents = (fetchedCommits || []).slice(0, 8).map((c) => ({
        id: c.hash || c.shortHash,
        type: 'COMMIT' as const,
        title: c.message.split('\n')[0],
        description: `Commit ${c.shortHash || c.hash.substring(0, 7)} by ${c.authorName}`,
        author: c.authorName,
        timestamp: c.date,
        sourceUrl: c.url,
        nodeId: `commit:${c.shortHash || c.hash.substring(0, 7)}`
      }));

      return {
        repository: {
          id: activeSummary.repository.id,
          name: activeSummary.repository.name,
          branch: activeSummary.repository.defaultBranch || 'main',
          status: 'Engineering Memory Ready',
          analyzedAt: activeSummary.analyzedAt,
          url: activeSummary.repository.url
        },
        repositories: repositoriesList,
        graphSummary: gSum,
        graphData: fullGraph,
        summary: activeSummary,
        commits: fetchedCommits || [],
        issues: issuesAndPrs?.issues || [],
        pullRequests: issuesAndPrs?.pullRequests || [],
        debtSummary: dSum,
        evidenceSummary: {
          totalRecords,
          evidenceCoverage: Math.round(evidenceCoverage * 100) / 100,
          factCount,
          inferenceCount,
          unknownCount
        },
        whySummary: {
          reconstructablePercentage: Math.round((evidenceCoverage * 0.85 + 0.15) * 100),
          unknownRationaleCount: dSum?.unresolvedWhyCount ?? unknownCount,
          lowConfidenceCount: dSum?.weakContextComponentCount ?? 2
        },
        decisionDebtSummary: {
          score: dSum?.overallScore ?? 0,
          level: (dSum?.overallLevel as any) ?? 'LOW',
          highCount: dSum?.breakdown?.HIGH ?? 0,
          mediumCount: dSum?.breakdown?.MEDIUM ?? 0,
          lowCount: dSum?.breakdown?.LOW ?? 0,
          topDebtComponents: (dSum?.topDebtComponents || []).map((d) => ({
            id: d.id,
            targetNodeId: d.targetNodeId,
            targetNodeLabel: d.targetNodeLabel,
            score: d.score,
            level: d.level,
            explanation: d.explanation,
            signalsCount: d.signals.length,
            lastRationaleDate: d.lastRationaleDate
          }))
        },
        impactSummary: {
          highImpactCount: 0,
          mostConnectedCount: gSum?.topConnectedNodes.length ?? 0,
          topImpactComponents: []
        },
        recentEvents,
        isDemo: false
      };
    } catch {
      return this.getDemoDashboardData();
    }
  }

  static getDemoDashboardData(): DashboardData {
    return {
      repository: {
        id: 'demo-facebook-react',
        name: 'facebook/react',
        branch: 'main',
        status: 'Engineering Memory Ready',
        analyzedAt: new Date().toISOString(),
        url: 'https://github.com/facebook/react'
      },
      repositories: [
        {
          id: 'demo-facebook-react',
          name: 'facebook/react',
          url: 'https://github.com/facebook/react',
          analyzedAt: new Date().toISOString(),
          totalCommits: 142,
          totalEvidenceRecords: 3841
        }
      ],
      graphSummary: null,
      evidenceSummary: { totalRecords: 3841, evidenceCoverage: 0.98, factCount: 2840, inferenceCount: 890, unknownCount: 111 },
      whySummary: { reconstructablePercentage: 85, unknownRationaleCount: 12, lowConfidenceCount: 4 },
      decisionDebtSummary: { score: 24, level: 'LOW', highCount: 1, mediumCount: 2, lowCount: 5, topDebtComponents: [] },
      impactSummary: { highImpactCount: 1, mostConnectedCount: 4, topImpactComponents: [] },
      recentEvents: [],
      isDemo: true
    };
  }
}
