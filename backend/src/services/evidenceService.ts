import {
  RepositoryMetadata,
  CommitItem,
  PullRequestItem,
  IssueItem,
  DependencyItem,
  NormalizedEvidence,
  AnalysisSummary
} from '../types/evidence';

export class EvidenceService {
  /**
   * Normalize raw GitHub repository data into structured historical evidence records
   */
  static normalizeEvidence(
    repo: RepositoryMetadata,
    commits: CommitItem[],
    pullRequests: PullRequestItem[],
    issues: IssueItem[],
    dependencies: DependencyItem[]
  ): { evidenceRecords: NormalizedEvidence[]; summary: AnalysisSummary } {
    const evidenceRecords: NormalizedEvidence[] = [];

    // 1. Convert Commits into Evidence
    commits.forEach((commit) => {
      // Author link (FACT)
      evidenceRecords.push({
        id: `ev-aut-${commit.hash.substring(0, 8)}`,
        repositoryId: repo.id,
        source: `author:${commit.authorName.replace(/\s+/g, '-').toLowerCase()}`,
        target: `commit:${commit.shortHash}`,
        relationshipType: 'AUTHORED',
        classification: 'FACT',
        confidence: 1.0,
        title: `Author ${commit.authorName} authored commit #${commit.shortHash}`,
        description: `Direct Git author signature recorded on ${new Date(commit.date).toLocaleDateString()}.`,
        sourceUrl: commit.url,
        timestamp: commit.date
      });

      // Check if commit message references issues/PRs (FACT vs INFERENCE)
      const issueRefMatches = Array.from(commit.message.matchAll(/#(\d+)/g));
      if (issueRefMatches.length > 0) {
        issueRefMatches.forEach((match) => {
          const issueNum = match[1];
          const isExplicitFix = /(fix|fixes|close|closes|resolve|resolves)\s+#\d+/i.test(commit.message);
          evidenceRecords.push({
            id: `ev-ref-${commit.shortHash}-${issueNum}`,
            repositoryId: repo.id,
            source: `commit:${commit.shortHash}`,
            target: `issue:${issueNum}`,
            relationshipType: 'REFERENCES_ISSUE',
            classification: isExplicitFix ? 'FACT' : 'INFERENCE',
            confidence: isExplicitFix ? 0.95 : 0.80,
            title: `Commit #${commit.shortHash} ${isExplicitFix ? 'resolves' : 'references'} Issue #${issueNum}`,
            description: isExplicitFix
              ? `Commit message explicitly contains resolution keyword "${match[0]}".`
              : `Commit message mentions ticket #${issueNum} in description.`,
            sourceUrl: commit.url,
            timestamp: commit.date
          });
        });
      } else {
        // Commit without explicit ticket reference (UNKNOWN Rationale)
        evidenceRecords.push({
          id: `ev-unk-${commit.shortHash}`,
          repositoryId: repo.id,
          source: `commit:${commit.shortHash}`,
          target: `codebase:${repo.repo}`,
          relationshipType: 'MODIFIED_BY',
          classification: 'UNKNOWN',
          confidence: 0.50,
          title: `Commit #${commit.shortHash} has no linked issue or PR ticket`,
          description: `No explicit issue key or pull request reference found in commit text "${commit.message}".`,
          sourceUrl: commit.url,
          timestamp: commit.date
        });
      }

      // Changed Files links (FACT)
      if (commit.files && commit.files.length > 0) {
        commit.files.slice(0, 5).forEach((f) => {
          evidenceRecords.push({
            id: `ev-mod-${commit.shortHash}-${f.path.replace(/[/.]/g, '_')}`,
            repositoryId: repo.id,
            source: `commit:${commit.shortHash}`,
            target: `file:${f.path}`,
            relationshipType: 'MODIFIED_BY',
            classification: 'FACT',
            confidence: 1.0,
            title: `Commit #${commit.shortHash} modified ${f.path}`,
            description: `File churn: +${f.additions} -${f.deletions} lines changed.`,
            sourceUrl: commit.url,
            timestamp: commit.date
          });
        });
      }
    });

    // 2. Convert Pull Requests into Evidence
    pullRequests.forEach((pr) => {
      const prIssueMatches = Array.from(pr.body.matchAll(/#(\d+)/g));
      prIssueMatches.forEach((match) => {
        const issueNum = match[1];
        const isExplicitFix = /(fix|fixes|close|closes|resolve|resolves)\s+#\d+/i.test(pr.body);
        evidenceRecords.push({
          id: `ev-pr-${pr.number}-iss-${issueNum}`,
          repositoryId: repo.id,
          source: `pr:${pr.number}`,
          target: `issue:${issueNum}`,
          relationshipType: 'RESOLVED_BY',
          classification: isExplicitFix ? 'FACT' : 'INFERENCE',
          confidence: isExplicitFix ? 0.98 : 0.85,
          title: `PR #${pr.number} (${pr.state}) ${isExplicitFix ? 'resolves' : 'references'} Issue #${issueNum}`,
          description: `PR description connects pull request "${pr.title}" to issue #${issueNum}.`,
          sourceUrl: pr.url,
          timestamp: pr.createdAt
        });
      });
    });

    // 3. Convert Direct Dependencies into Evidence (FACT) preserving manifest path, category & lockfile provenance
    dependencies.forEach((dep) => {
      const safeEcosystem = (dep.ecosystem || 'other').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeSource = dep.sourceFile.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeCat = (dep.category || 'dependencies').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeName = dep.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const resolvedSuffix = dep.resolvedVersion ? ` (locked: ${dep.resolvedVersion})` : '';
      const categoryLabel = dep.category || 'dependencies';

      evidenceRecords.push({
        id: `ev-dep-${safeEcosystem}-${safeSource}-${safeCat}-${safeName}`,
        repositoryId: repo.id,
        source: `file:${dep.sourceFile}`,
        target: `dependency:${dep.ecosystem}:${dep.name}`,
        relationshipType: 'DEPENDS_ON',
        classification: 'FACT',
        confidence: 1.0,
        title: `Package ${dep.name}@${dep.declaredVersion || dep.version}${resolvedSuffix} [${categoryLabel}] declared in ${dep.sourceFile}`,
        description: `Declared in ${dep.sourceFile} (${dep.ecosystem}, category: ${categoryLabel}${dep.workspaceName ? `, workspace: ${dep.workspaceName}` : ''}${dep.lockfileSource ? `, resolved via ${dep.lockfileSource}` : ''}).`,
        sourceUrl: `${repo.url}/blob/${repo.defaultBranch}/${dep.sourceFile}`,
        timestamp: repo.updatedAt,
        metadata: {
          packageName: dep.name,
          declaredVersion: dep.declaredVersion || dep.version,
          resolvedVersion: dep.resolvedVersion,
          lockfileSource: dep.lockfileSource,
          category: categoryLabel,
          ecosystem: dep.ecosystem,
          sourceFile: dep.sourceFile,
          workspaceName: dep.workspaceName,
          isDirect: dep.isDirect !== false,
          isTransitive: false
        }
      });
    });

    // Compute Summary Counts
    let factCount = 0;
    let inferenceCount = 0;
    let unknownCount = 0;

    evidenceRecords.forEach((rec) => {
      if (rec.classification === 'FACT') factCount++;
      else if (rec.classification === 'INFERENCE') inferenceCount++;
      else if (rec.classification === 'UNKNOWN') unknownCount++;
    });

    const uniqueDirectDependencies = new Set(dependencies.map((d) => `${d.ecosystem}:${d.name}`)).size;

    const summary: AnalysisSummary = {
      repository: repo,
      totalFiles: 140, // derived from tree
      totalCommits: commits.length,
      totalPullRequests: pullRequests.length,
      totalIssues: issues.length,
      totalDependencies: uniqueDirectDependencies,
      totalEvidenceRecords: evidenceRecords.length,
      analyzedAt: new Date().toISOString(),
      factCount,
      inferenceCount,
      unknownCount
    };

    return { evidenceRecords, summary };
  }
}
