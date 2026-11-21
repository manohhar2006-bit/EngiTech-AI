import {
  RepositoryMetadata,
  FileTreeItem,
  CommitItem,
  PullRequestItem,
  IssueItem,
  DependencyExtractionResult
} from '../types/evidence.js';
import {
  findSupportedManifestAndLockfilePaths,
  parseDependenciesFromFiles,
  ManifestFileInput
} from './manifestParser.js';

export interface GitHubUrlInfo {
  owner: string;
  repo: string;
}

export function normalizeGitHubUrl(inputUrl: string): GitHubUrlInfo {
  if (!inputUrl || typeof inputUrl !== 'string') {
    throw new Error('Invalid GitHub URL provided. URL cannot be empty.');
  }

  let cleaned = inputUrl.trim();
  // Strip trailing .git
  if (cleaned.endsWith('.git')) {
    cleaned = cleaned.slice(0, -4);
  }
  // Strip trailing slash
  if (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }

  // Handle owner/repo shorthand e.g. "facebook/react"
  const shorthandMatch = /^([a-zA-Z0-9_\-.]+)\/([a-zA-Z0-9_\-.]+)$/.exec(cleaned);
  if (shorthandMatch) {
    return { owner: shorthandMatch[1], repo: shorthandMatch[2] };
  }

  // Handle full URL e.g. "https://github.com/facebook/react"
  try {
    const parsed = new URL(cleaned.startsWith('http') ? cleaned : `https://${cleaned}`);
    if (!parsed.hostname.includes('github.com')) {
      throw new Error('URL must be a valid github.com repository link.');
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      throw new Error('GitHub URL must include both owner and repository name.');
    }
    return { owner: parts[0], repo: parts[1] };
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('github.com')) {
      throw err;
    }
    throw new Error(`Failed to parse GitHub repository URL "${inputUrl}". Example format: https://github.com/owner/repository`);
  }
}

/**
 * Server-side GitHub API headers using GITHUB_TOKEN if available
 */
function getGitHubHeaders(useToken: boolean = true): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'EngiTrace-Archaeology-Engine/0.1'
  };
  if (!useToken) return headers;

  const token = process.env.GITHUB_TOKEN;
  if (token && token.trim() !== '' && !token.includes('your_github')) {
    const trimmed = token.trim();
    if (trimmed.startsWith('github_pat_') || trimmed.startsWith('ghp_')) {
      headers.Authorization = `Bearer ${trimmed}`;
    } else {
      headers.Authorization = `token ${trimmed}`;
    }
  }
  return headers;
}

export class GitHubService {
  /**
   * Fetch Repository Metadata from GitHub API
   */
  static async fetchRepositoryMetadata(owner: string, repo: string): Promise<{ metadata: RepositoryMetadata; useToken: boolean }> {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    let useToken = true;
    let response = await fetch(url, { headers: getGitHubHeaders(true) });

    if (response.status === 401) {
      console.warn(`[GitHubService] Configured GITHUB_TOKEN returned 401 Unauthorized for "${owner}/${repo}". Retrying unauthenticated request for public repository...`);
      const unauthRes = await fetch(url, { headers: getGitHubHeaders(false) });
      if (unauthRes.ok) {
        response = unauthRes;
        useToken = false;
        console.log(`[GitHubService] Unauthenticated fallback succeeded for public repository "${owner}/${repo}".`);
      } else {
        throw new Error(`GitHub token is invalid or expired (HTTP 401). Update GITHUB_TOKEN in backend/.env or verify repository permissions.`);
      }
    }

    if (response.status === 404) {
      throw new Error(`GitHub could not find repository "${owner}/${repo}". Verify the repository URL and visibility (private repos require a valid GITHUB_TOKEN with repo scope).`);
    }
    if (response.status === 403) {
      const rateRemaining = response.headers.get('x-ratelimit-remaining');
      if (rateRemaining === '0') {
        throw new Error('GitHub API rate limit exceeded. Retry later or configure a valid GITHUB_TOKEN in backend/.env.');
      }
      throw new Error(`Access forbidden to GitHub repository "${owner}/${repo}".`);
    }
    if (!response.ok) {
      throw new Error(`GitHub API returned error ${response.status} ${response.statusText} for repository "${owner}/${repo}".`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      metadata: {
        id: `repo-${owner}-${repo}`,
        url: (data.html_url as string) || `https://github.com/${owner}/${repo}`,
        owner: ((data.owner as Record<string, unknown>)?.login as string) || owner,
        repo: (data.name as string) || repo,
        name: (data.full_name as string) || `${owner}/${repo}`,
        description: (data.description as string) || 'No description provided.',
        defaultBranch: (data.default_branch as string) || 'main',
        language: (data.language as string) || 'TypeScript',
        stars: (data.stargazers_count as number) || 0,
        forks: (data.forks_count as number) || 0,
        openIssuesCount: (data.open_issues_count as number) || 0,
        isPrivate: Boolean(data.private),
        createdAt: (data.created_at as string) || new Date().toISOString(),
        updatedAt: (data.updated_at as string) || new Date().toISOString()
      },
      useToken
    };
  }

  /**
   * Fetch Repository File Tree
   */
  static async fetchFileTree(owner: string, repo: string, branch: string = 'main', useToken: boolean = true): Promise<FileTreeItem[]> {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
      let response = await fetch(url, { headers: getGitHubHeaders(useToken) });
      if (response.status === 401 && useToken) {
        response = await fetch(url, { headers: getGitHubHeaders(false) });
      }
      if (!response.ok) {
        return await this.fetchTopLevelContents(owner, repo, useToken);
      }
      const data = (await response.json()) as { tree?: Array<{ path: string; type: string; size?: number; sha?: string }> };
      if (!data.tree) return [];

      return data.tree.slice(0, 2000).map((item) => {
        const ext = item.path.includes('.') ? item.path.split('.').pop() : undefined;
        return {
          path: item.path,
          type: item.type === 'tree' ? 'dir' : 'file',
          size: item.size,
          extension: ext,
          sha: item.sha
        };
      });
    } catch {
      return [];
    }
  }

  private static async fetchTopLevelContents(owner: string, repo: string, useToken: boolean = true): Promise<FileTreeItem[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents`;
    let response = await fetch(url, { headers: getGitHubHeaders(useToken) });
    if (response.status === 401 && useToken) {
      response = await fetch(url, { headers: getGitHubHeaders(false) });
    }
    if (!response.ok) return [];
    const data = (await response.json()) as Array<{ path: string; type: string; size?: number; sha?: string }>;
    return data.map((item) => ({
      path: item.path,
      type: item.type === 'dir' ? 'dir' : 'file',
      size: item.size,
      extension: item.path.includes('.') ? item.path.split('.').pop() : undefined,
      sha: item.sha
    }));
  }

  /**
   * Fetch Single Commit Detail including changed files
   */
  static async fetchCommitDetail(owner: string, repo: string, sha: string, useToken: boolean = true): Promise<Array<{ filename: string; additions: number; deletions: number; changes: number; patch?: string }>> {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
      let response = await fetch(url, { headers: getGitHubHeaders(useToken) });
      if (response.status === 401 && useToken) {
        response = await fetch(url, { headers: getGitHubHeaders(false) });
      }
      if (!response.ok) return [];
      const data = (await response.json()) as {
        files?: Array<{ filename: string; additions: number; deletions: number; changes: number; patch?: string }>;
      };
      return data.files || [];
    } catch (err) {
      console.warn(`[GitHubService] Failed to fetch details for commit ${sha}:`, err);
      return [];
    }
  }

  /**
   * Fetch Recent Git Commits with detailed changed file information
   */
  static async fetchCommits(owner: string, repo: string, limit: number = 30, useToken: boolean = true): Promise<CommitItem[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${limit}`;
    let response = await fetch(url, { headers: getGitHubHeaders(useToken) });
    if (response.status === 401 && useToken) {
      response = await fetch(url, { headers: getGitHubHeaders(false) });
    }
    if (!response.ok) return [];

    const rawCommits = (await response.json()) as Array<{
      sha: string;
      html_url: string;
      commit: {
        message: string;
        author: { name: string; email: string; date: string };
      };
      parents?: Array<{ sha: string; html_url: string }>;
      files?: Array<{ filename: string; additions: number; deletions: number; changes: number; patch?: string }>;
    }>;

    const commitItems: CommitItem[] = [];

    // Process commit details in controlled batches of 5 to respect GitHub API rate limits
    const batchSize = 5;
    for (let i = 0; i < rawCommits.length; i += batchSize) {
      const batch = rawCommits.slice(i, i + batchSize);
      const detailsResults = await Promise.all(
        batch.map(async (item) => {
          const files = item.files && item.files.length > 0
            ? item.files
            : await this.fetchCommitDetail(owner, repo, item.sha, useToken);
          return { item, files };
        })
      );

      for (const { item, files } of detailsResults) {
        const msg = item.commit?.message || 'No commit message';
        const firstLine = msg.split('\n')[0];
        const parentHashes = item.parents?.map((p) => p.sha) || [];
        commitItems.push({
          hash: item.sha,
          shortHash: item.sha.substring(0, 7),
          message: firstLine,
          authorName: item.commit?.author?.name || 'Unknown Author',
          authorEmail: item.commit?.author?.email || 'unknown@github.com',
          date: item.commit?.author?.date || new Date().toISOString(),
          url: item.html_url || `https://github.com/${owner}/${repo}/commit/${item.sha}`,
          changedFilesCount: files.length,
          parents: parentHashes,
          files: files.map((f) => ({
            path: f.filename,
            additions: f.additions,
            deletions: f.deletions,
            changes: f.changes,
            patch: f.patch
          }))
        });
      }
    }

    return commitItems;
  }

  /**
   * Fetch Pull Requests
   */
  static async fetchPullRequests(owner: string, repo: string, limit: number = 20, useToken: boolean = true): Promise<PullRequestItem[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=${limit}`;
    let response = await fetch(url, { headers: getGitHubHeaders(useToken) });
    if (response.status === 401 && useToken) {
      response = await fetch(url, { headers: getGitHubHeaders(false) });
    }
    if (!response.ok) return [];

    const data = (await response.json()) as Array<{
      id: number;
      number: number;
      title: string;
      body: string;
      html_url: string;
      state: string;
      created_at: string;
      merged_at?: string;
      closed_at?: string;
      user: { login: string };
    }>;

    return data.map((pr) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body || '',
      author: pr.user?.login || 'unknown',
      state: pr.merged_at ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
      createdAt: pr.created_at,
      mergedAt: pr.merged_at,
      closedAt: pr.closed_at,
      url: pr.html_url
    }));
  }

  /**
   * Fetch Issues
   */
  static async fetchIssues(owner: string, repo: string, limit: number = 20, useToken: boolean = true): Promise<IssueItem[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=${limit}`;
    let response = await fetch(url, { headers: getGitHubHeaders(useToken) });
    if (response.status === 401 && useToken) {
      response = await fetch(url, { headers: getGitHubHeaders(false) });
    }
    if (!response.ok) return [];

    const data = (await response.json()) as Array<{
      id: number;
      number: number;
      title: string;
      body: string;
      html_url: string;
      state: string;
      created_at: string;
      closed_at?: string;
      user: { login: string };
      labels: Array<{ name: string }>;
      pull_request?: unknown;
    }>;

    // Filter out pull requests (GitHub issues API includes PRs)
    const issuesOnly = data.filter((item) => !item.pull_request);

    return issuesOnly.map((iss) => ({
      id: iss.id,
      number: iss.number,
      title: iss.title,
      body: iss.body || '',
      author: iss.user?.login || 'unknown',
      state: iss.state === 'closed' ? 'closed' : 'open',
      labels: iss.labels?.map((l) => l.name) || [],
      createdAt: iss.created_at,
      closedAt: iss.closed_at,
      url: iss.html_url
    }));
  }


  /**
   * Extract Lightweight Dependencies from file tree
   */
  static parseDependenciesFromFiles = parseDependenciesFromFiles;

  /**
   * Extract declared dependencies by fetching and deterministically parsing actual repository manifests
   * and lockfiles. Never invents hardcoded or language-inferred stub packages.
   */
  static async extractDependencies(
    fileTree: FileTreeItem[],
    options?: {
      owner?: string;
      repo?: string;
      branch?: string;
      useToken?: boolean;
      fileContents?: Map<string, string>;
    }
  ): Promise<DependencyExtractionResult> {
    const { manifestPaths, lockfilePaths } = findSupportedManifestAndLockfilePaths(fileTree);
    const prioritizedManifests = [...manifestPaths]
      .sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path))
      .slice(0, 40);
    const prioritizedLockfiles = [...lockfilePaths]
      .sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path))
      .slice(0, 12);

    const manifestFiles: ManifestFileInput[] = [];
    const lockfileFiles: ManifestFileInput[] = [];
    const failedFetches: Array<{ path: string; kind: 'manifest' | 'lockfile'; error: string }> = [];

    if (options?.fileContents) {
      for (const item of prioritizedManifests) {
        const content = options.fileContents.get(item.path);
        if (typeof content === 'string') {
          manifestFiles.push({ path: item.path, content });
        }
      }
      for (const item of prioritizedLockfiles) {
        const content = options.fileContents.get(item.path);
        if (typeof content === 'string') {
          lockfileFiles.push({ path: item.path, content });
        }
      }
      return parseDependenciesFromFiles(manifestFiles, lockfileFiles, failedFetches);
    }

    if (!options?.owner || !options?.repo) {
      return {
        directDependencies: [],
        transitiveDependencies: [],
        manifests: [],
        lockfiles: [],
        warnings: []
      };
    }

    const branch = options.branch || 'main';
    const useToken = options.useToken !== false;
    const shaCache = new Map<string, { success: boolean; content?: string; size?: number; reason?: string; rateLimited?: boolean }>();

    const manifestBatch = await this.fetchFilesBatch({
      owner: options.owner,
      repo: options.repo,
      branch,
      useToken,
      items: prioritizedManifests,
      maxBytes: 256 * 1024,
      truncate: false,
      concurrency: 5,
      blobCache: shaCache
    });

    for (const item of prioritizedManifests) {
      const res = manifestBatch.get(item.path);
      if (res?.success && typeof res.content === 'string') {
        manifestFiles.push({ path: item.path, content: res.content });
      } else if (res) {
        failedFetches.push({
          path: item.path,
          kind: 'manifest',
          error: res.reason || 'Failed to fetch manifest content'
        });
      }
    }

    const lockfileBatch = await this.fetchFilesBatch({
      owner: options.owner,
      repo: options.repo,
      branch,
      useToken,
      items: prioritizedLockfiles,
      maxBytes: 2 * 1024 * 1024,
      truncate: false,
      concurrency: 3,
      blobCache: shaCache
    });

    for (const item of prioritizedLockfiles) {
      const res = lockfileBatch.get(item.path);
      if (res?.success && typeof res.content === 'string') {
        lockfileFiles.push({ path: item.path, content: res.content });
      } else if (res) {
        failedFetches.push({
          path: item.path,
          kind: 'lockfile',
          error: res.reason || 'Failed to fetch lockfile content'
        });
      }
    }

    return parseDependenciesFromFiles(manifestFiles, lockfileFiles, failedFetches);
  }

  /**
   * Fetch multiple repository files with bounded concurrency, size guards, rate-limit handling,
   * and blob SHA caching.
   */
  static async fetchFilesBatch(params: {
    owner: string;
    repo: string;
    branch: string;
    useToken?: boolean;
    items: FileTreeItem[];
    concurrency?: number;
    maxBytes?: number;
    truncate?: boolean;
    blobCache?: Map<string, { success: boolean; content?: string; size?: number; reason?: string; truncated?: boolean; rateLimited?: boolean }>;
  }): Promise<Map<string, { success: boolean; content?: string; size?: number; reason?: string; truncated?: boolean; rateLimited?: boolean }>> {
    const results = new Map<string, { success: boolean; content?: string; size?: number; reason?: string; truncated?: boolean; rateLimited?: boolean }>();
    const cache = params.blobCache || new Map();
    const maxBytes = params.maxBytes ?? 120 * 1024;
    const concurrency = Math.max(1, Math.min(params.concurrency ?? 5, 8));
    let rateLimitedHit = false;
    let index = 0;

    const worker = async () => {
      while (index < params.items.length) {
        const currentIdx = index++;
        const item = params.items[currentIdx];

        if (rateLimitedHit) {
          results.set(item.path, {
            success: false,
            rateLimited: true,
            reason: 'Skipped due to GitHub API rate limit.'
          });
          continue;
        }

        if (item.size !== undefined && item.size > maxBytes && !params.truncate) {
          results.set(item.path, {
            success: false,
            size: item.size,
            reason: `Skipped file exceeding size limit (${item.size} bytes > ${maxBytes} bytes).`
          });
          continue;
        }

        const cacheKey = item.sha ? `sha:${item.sha}` : `path:${item.path}`;
        if (cache.has(cacheKey)) {
          results.set(item.path, cache.get(cacheKey)!);
          continue;
        }

        const fetched = await this.fetchFileContent(
          params.owner,
          params.repo,
          item.path,
          params.branch,
          params.useToken !== false,
          { maxBytes, truncate: params.truncate ?? false }
        );

        if (fetched.rateLimited) {
          rateLimitedHit = true;
        }

        cache.set(cacheKey, fetched);
        results.set(item.path, fetched);
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, params.items.length || 1) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  /**
   * Fetch file content from GitHub repository with security checks, size bounds, and error handling.
   */
  static async fetchFileContent(
    owner: string,
    repo: string,
    filePath: string,
    branch: string = 'main',
    useToken: boolean = true,
    options?: { maxBytes?: number; truncate?: boolean }
  ): Promise<{ success: boolean; content?: string; size?: number; reason?: string; truncated?: boolean; rateLimited?: boolean }> {
    if (!owner || !repo || !filePath) {
      return { success: false, reason: 'Invalid parameters: owner, repo, and filePath are required.' };
    }

    // Security check: prevent path traversal or arbitrary absolute filesystem paths
    const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (cleanPath.includes('..') || cleanPath.startsWith('/') || cleanPath.includes(':\\')) {
      return { success: false, reason: 'Invalid file path: path traversal or absolute paths are prohibited.' };
    }

    // Check for common binary extensions
    const binaryExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz',
      '.exe', '.dll', '.so', '.dylib', '.woff', '.woff2', '.ttf', '.eot',
      '.wasm', '.mp4', '.mp3', '.bin', '.pyc', '.lockb'
    ];
    const lowerPath = cleanPath.toLowerCase();
    if (binaryExtensions.some((ext) => lowerPath.endsWith(ext))) {
      return { success: false, reason: 'Binary file format (content not readable as text).' };
    }

    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${cleanPath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`;

      const headers = getGitHubHeaders(useToken);
      headers.Accept = 'application/vnd.github.v3.raw';

      let response = await fetch(url, { headers });

      if (response.status === 401 && useToken) {
        const unauthHeaders = getGitHubHeaders(false);
        unauthHeaders.Accept = 'application/vnd.github.v3.raw';
        response = await fetch(url, { headers: unauthHeaders });
      }

      if (
        response.status === 429 ||
        (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')
      ) {
        return {
          success: false,
          rateLimited: true,
          reason: `GitHub API rate limit exceeded (status ${response.status}) when fetching "${cleanPath}".`
        };
      }

      if (response.status === 404) {
        return { success: false, reason: `File "${cleanPath}" not found in repository ${owner}/${repo} (branch: ${branch}).` };
      }

      if (!response.ok) {
        return { success: false, reason: `GitHub API returned status ${response.status} when fetching file content.` };
      }

      const text = await response.text();
      if (text.slice(0, 4096).includes('\u0000')) {
        return { success: false, size: text.length, reason: 'Binary file content detected (null bytes present).' };
      }

      const maxBytes = options?.maxBytes ?? 50 * 1024;
      const shouldTruncate = options?.truncate !== false;

      if (text.length > maxBytes) {
        if (!shouldTruncate) {
          return {
            success: false,
            size: text.length,
            reason: `Skipped file exceeding size limit (${text.length} bytes > ${maxBytes} bytes).`
          };
        }
        const limitKb = Math.round(maxBytes / 1024);
        const finalContent = text.substring(0, maxBytes) + `\n\n[... Content truncated after ${limitKb}KB ...]`;
        return {
          success: true,
          content: finalContent,
          size: text.length,
          truncated: true,
          reason: `Content truncated at ${limitKb}KB limit`
        };
      }

      return {
        success: true,
        content: text,
        size: text.length,
        truncated: false
      };
    } catch (err: any) {
      console.warn(`[GitHubService] Failed to fetch content for ${owner}/${repo}/${cleanPath}:`, err?.message || err);
      return { success: false, reason: `Network or API error: ${err?.message || String(err)}` };
    }
  }
}
