import path from 'path';
import { ImportClassification } from './types.js';

export interface ResolvedImportResult {
  kind: ImportClassification;
  resolvedFilePath?: string;
  externalPackageName?: string;
  resolutionNote?: string;
}

const PROBE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs', '.d.ts'];
const TS_SOURCE_EXT_FALLBACKS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx', '.d.ts'],
  '.jsx': ['.tsx', '.ts'],
  '.mjs': ['.mts', '.ts'],
  '.cjs': ['.cts', '.ts']
};

export function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function extractExternalPackageName(specifier: string): string {
  if (specifier.startsWith('node:')) {
    return specifier;
  }
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split('/')[0];
}

/**
 * Resolve an import/export specifier strictly against an actual set of repository file paths.
 * Never fabricates nonexistent destination paths.
 */
export function resolveImportSpecifier(
  importerFilePath: string,
  specifier: string,
  repoFilePaths?: Set<string>
): ResolvedImportResult {
  const trimmed = specifier.trim();
  if (!trimmed) {
    return { kind: 'alias_or_unresolved', resolutionNote: 'Empty import specifier' };
  }

  // Relative internal import
  if (trimmed === '.' || trimmed === '..' || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    if (!repoFilePaths || repoFilePaths.size === 0) {
      return {
        kind: 'relative_internal',
        resolutionNote: 'Repository file tree unavailable for import target verification'
      };
    }

    const normImporter = normalizeRepoPath(importerFilePath);
    const importerDir = path.posix.dirname(normImporter);
    const joined = importerDir === '.' ? trimmed : path.posix.join(importerDir, trimmed);
    const normalizedCandidate = path.posix.normalize(joined).replace(/^\/+/, '');

    // Reject path escapes outside repository root
    if (normalizedCandidate.startsWith('..')) {
      return {
        kind: 'relative_internal',
        resolutionNote: `Relative import "${trimmed}" escapes repository root`
      };
    }

    const candidates: string[] = [normalizedCandidate];

    // TypeScript ESM convention: import './foo.js' -> './foo.ts' / './foo.tsx'
    const ext = path.posix.extname(normalizedCandidate).toLowerCase();
    if (ext && TS_SOURCE_EXT_FALLBACKS[ext]) {
      const stem = normalizedCandidate.slice(0, -ext.length);
      for (const fallbackExt of TS_SOURCE_EXT_FALLBACKS[ext]) {
        candidates.push(`${stem}${fallbackExt}`);
      }
    }

    // Extensionless file or directory index probing
    for (const probeExt of PROBE_EXTENSIONS) {
      candidates.push(`${normalizedCandidate}${probeExt}`);
    }
    const dirBase = normalizedCandidate === '.' ? 'index' : `${normalizedCandidate}/index`;
    for (const probeExt of PROBE_EXTENSIONS) {
      if (probeExt === '.d.ts') continue;
      candidates.push(`${dirBase}${probeExt}`);
    }

    for (const candidate of candidates) {
      if (repoFilePaths.has(candidate)) {
        return {
          kind: 'relative_internal',
          resolvedFilePath: candidate
        };
      }
    }

    return {
      kind: 'relative_internal',
      resolutionNote: `Target "${normalizedCandidate}" not found in repository file tree`
    };
  }

  // Path alias or root-absolute specifier
  if (trimmed.startsWith('@/') || trimmed.startsWith('~/') || trimmed.startsWith('/') || trimmed.startsWith('#')) {
    return {
      kind: 'alias_or_unresolved',
      resolutionNote: `Alias or non-relative specifier "${trimmed}" not resolved without tsconfig path mapping`
    };
  }

  // External package or Node builtin
  return {
    kind: 'external_package',
    externalPackageName: extractExternalPackageName(trimmed)
  };
}

