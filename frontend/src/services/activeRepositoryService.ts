const STORAGE_KEY = 'engitrace_active_repo_id';
const LEGACY_STORAGE_KEY = 'codeorigin_active_repo_id';

export type ActiveRepoListener = (repoId: string) => void;

export class ActiveRepositoryService {
  private static listeners: Set<ActiveRepoListener> = new Set();

  /**
   * Get current active repository ID.
   * Priority: 1. URL search parameter `?repo=<id>` 2. LocalStorage `engitrace_active_repo_id` (with fallback to legacy key) 3. null
   */
  static getActiveRepoId(): string | null {
    if (typeof window === 'undefined') return null;

    const params = new URLSearchParams(window.location.search);
    const urlRepoId = params.get('repo');
    if (urlRepoId) return urlRepoId;

    return localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || null;
  }

  /**
   * Set active repository ID and notify all subscribers.
   */
  static setActiveRepoId(repoId: string, updateUrl: boolean = true): void {
    if (typeof window === 'undefined') return;

    const current = localStorage.getItem(STORAGE_KEY);
    if (current === repoId && !updateUrl) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, repoId);

    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set('repo', repoId);
      window.history.replaceState({}, '', url.toString());
    }

    this.listeners.forEach((listener) => {
      try {
        listener(repoId);
      } catch (err) {
        console.error('[ActiveRepositoryService] Listener error:', err);
      }
    });
  }

  /**
   * Subscribe to active repository changes.
   */
  static subscribe(listener: ActiveRepoListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
