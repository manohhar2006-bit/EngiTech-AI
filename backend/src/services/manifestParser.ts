import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import { XMLParser } from 'fast-xml-parser';
import {
  DependencyCategory,
  DependencyExtractionResult,
  DependencyItem,
  FileTreeItem,
  LockfileParseResult,
  ManifestParseResult,
  TransitiveDependencyItem
} from '../types/evidence.js';

export interface ManifestFileInput {
  path: string;
  content: string;
}

export interface ParsedManifestOutput {
  manifest: ManifestParseResult;
  dependencies: DependencyItem[];
  indirectDependencies?: TransitiveDependencyItem[];
}

export interface ResolvedLockEntry {
  name: string;
  version: string;
  specifier?: string;
  importerPath?: string;
  parentPackage?: string;
}

export interface ParsedLockfileOutput {
  lockfile: LockfileParseResult;
  resolvedByImporterAndName: Map<string, string>;
  resolvedByName: Map<string, string>;
  packages: ResolvedLockEntry[];
}

export interface ManifestParser {
  id: string;
  ecosystem: DependencyItem['ecosystem'];
  manifestType: string;
  canParse(filePath: string): boolean;
  parse(filePath: string, content: string): ParsedManifestOutput;
}

export interface LockfileParser {
  id: string;
  ecosystem: DependencyItem['ecosystem'];
  canParse(filePath: string): boolean;
  parse(filePath: string, content: string): ParsedLockfileOutput;
}

const IGNORED_PATH_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  'vendor',
  '.venv',
  'venv',
  'target'
]);

function normalizePosixPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function isIgnoredPath(filePath: string): boolean {
  const segments = normalizePosixPath(filePath).split('/');
  return segments.some((seg) => IGNORED_PATH_SEGMENTS.has(seg));
}

function getDirName(filePath: string): string {
  const norm = normalizePosixPath(filePath);
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? '.' : norm.slice(0, idx);
}

function getBaseName(filePath: string): string {
  const norm = normalizePosixPath(filePath);
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? norm : norm.slice(idx + 1);
}

function parsePep508Specifier(rawLine: string): { name: string; version: string } | null {
  const withoutComment = rawLine.replace(/#.*$/, '').trim();
  if (!withoutComment) return null;
  if (
    withoutComment.startsWith('-') ||
    withoutComment.startsWith('--') ||
    withoutComment.startsWith('http://') ||
    withoutComment.startsWith('https://') ||
    withoutComment.startsWith('git+') ||
    withoutComment.startsWith('file:') ||
    withoutComment.startsWith('.')
  ) {
    return null;
  }

  const withoutMarker = withoutComment.split(';')[0].trim();
  if (!withoutMarker) return null;

  // Handle PEP 508 direct URL syntax: name @ https://...
  const directAtIdx = withoutMarker.indexOf('@');
  if (directAtIdx > 0 && !withoutMarker.includes('==') && !withoutMarker.includes('>=') && !withoutMarker.includes('<=')) {
    const rawName = withoutMarker.slice(0, directAtIdx).replace(/\[.*\]/, '').trim();
    const target = withoutMarker.slice(directAtIdx + 1).trim();
    if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(rawName)) {
      return { name: rawName, version: target || 'unspecified' };
    }
    return null;
  }

  const match = withoutMarker.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]+\])?\s*(.*)$/);
  if (!match) return null;

  const name = match[1];
  const version = match[2].trim() || 'unspecified';
  return { name, version };
}

function stripPnpmVersionSuffix(rawVersion: string): string {
  const clean = rawVersion.trim();
  const parenIdx = clean.indexOf('(');
  const base = parenIdx >= 0 ? clean.slice(0, parenIdx) : clean;
  const underscoreIdx = base.indexOf('_');
  return underscoreIdx >= 0 ? base.slice(0, underscoreIdx) : base;
}

function parsePnpmPackageKey(key: string): { name: string; version: string } | null {
  // Formats across pnpm lockfile versions:
  // v5: '/react/18.2.0' or '/@scope/pkg/1.0.0' or '/@scope/pkg@1.0.0'
  // v6/v9: '/react@18.2.0' or 'react@18.2.0' or '@scope/pkg@1.0.0(react@18.2.0)'
  let cleaned = key.trim();
  if (cleaned.startsWith('/')) cleaned = cleaned.slice(1);
  if (!cleaned) return null;

  // Remove peer suffix in parentheses
  const parenIdx = cleaned.indexOf('(');
  if (parenIdx > 0) {
    cleaned = cleaned.slice(0, parenIdx);
  }
  const underscoreIdx = cleaned.indexOf('_');
  if (underscoreIdx > 0) {
    cleaned = cleaned.slice(0, underscoreIdx);
  }

  // Handle v6/v9 '@' delimiter (after optional scope '@')
  const searchFrom = cleaned.startsWith('@') ? cleaned.indexOf('/') + 1 : 0;
  const atIdx = cleaned.indexOf('@', Math.max(0, searchFrom));
  if (atIdx > 0) {
    const name = cleaned.slice(0, atIdx);
    const version = cleaned.slice(atIdx + 1).trim();
    if (name && version) return { name, version };
  }

  // Handle v5 '/' delimiter: react/18.2.0 or @scope/pkg/1.0.0
  const parts = cleaned.split('/');
  if (cleaned.startsWith('@') && parts.length >= 3) {
    return { name: `${parts[0]}/${parts[1]}`, version: parts[2] };
  }
  if (!cleaned.startsWith('@') && parts.length >= 2) {
    return { name: parts[0], version: parts[1] };
  }

  return null;
}

function extractNodeModulesPackageName(pkgPath: string): { name: string; importerPath: string; isNested: boolean } | null {
  const norm = normalizePosixPath(pkgPath);
  if (!norm) return null;

  const marker = 'node_modules/';
  const firstIdx = norm.indexOf(marker);
  if (firstIdx === -1) return null;

  const lastIdx = norm.lastIndexOf(marker);
  const importerPath = firstIdx === 0 ? '.' : norm.slice(0, firstIdx).replace(/\/$/, '') || '.';
  const name = norm.slice(lastIdx + marker.length);
  if (!name) return null;

  return {
    name,
    importerPath,
    isNested: firstIdx !== lastIdx
  };
}

// ---------------------------------------------------------------------------
// Manifest Parsers
// ---------------------------------------------------------------------------

const packageJsonParser: ManifestParser = {
  id: 'npm-package-json',
  ecosystem: 'npm',
  manifestType: 'package.json',
  canParse(filePath: string): boolean {
    return !isIgnoredPath(filePath) && getBaseName(filePath) === 'package.json';
  },
  parse(filePath: string, content: string): ParsedManifestOutput {
    const cleanPath = normalizePosixPath(filePath);
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
          manifest: {
            manifestPath: cleanPath,
            ecosystem: 'npm',
            manifestType: 'package.json',
            status: 'MALFORMED',
            error: 'Root JSON value in package.json is not an object',
            dependenciesCount: 0
          },
          dependencies: []
        };
      }

      const workspaceName = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : undefined;
      const categories: DependencyCategory[] = [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies'
      ];

      const dependencies: DependencyItem[] = [];
      for (const category of categories) {
        const section = parsed[category];
        if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
        for (const [pkgName, pkgVersion] of Object.entries(section as Record<string, unknown>)) {
          if (typeof pkgName !== 'string' || !pkgName.trim()) continue;
          const declaredVersion = typeof pkgVersion === 'string' && pkgVersion.trim() ? pkgVersion.trim() : 'unspecified';
          dependencies.push({
            name: pkgName.trim(),
            version: declaredVersion,
            declaredVersion,
            sourceFile: cleanPath,
            ecosystem: 'npm',
            category,
            isDirect: true,
            isTransitive: false,
            workspaceName,
            manifestType: 'package.json'
          });
        }
      }

      return {
        manifest: {
          manifestPath: cleanPath,
          ecosystem: 'npm',
          manifestType: 'package.json',
          workspaceName,
          status: 'PARSED',
          dependenciesCount: dependencies.length
        },
        dependencies
      };
    } catch (err: unknown) {
      return {
        manifest: {
          manifestPath: cleanPath,
          ecosystem: 'npm',
          manifestType: 'package.json',
          status: 'MALFORMED',
          error: err instanceof Error ? err.message : 'Invalid JSON syntax',
          dependenciesCount: 0
        },
        dependencies: []
      };
    }
  }
};

const requirementsTxtParser: ManifestParser = {
  id: 'pip-requirements-txt',
  ecosystem: 'pip',
  manifestType: 'requirements.txt',
  canParse(filePath: string): boolean {
    if (isIgnoredPath(filePath)) return false;
    const base = getBaseName(filePath).toLowerCase();
    return base === 'requirements.txt' || /^requirements[-_.].+\.txt$/.test(base);
  },
  parse(filePath: string, content: string): ParsedManifestOutput {
    const cleanPath = normalizePosixPath(filePath);
    const lower = cleanPath.toLowerCase();
    const category: DependencyCategory =
      lower.includes('dev') || lower.includes('test') || lower.includes('lint')
        ? 'devDependencies'
        : 'dependencies';

    const dependencies: DependencyItem[] = [];
    const seen = new Set<string>();
    const lines = content.split(/\r?\n/);

    // Handle backslash line continuations explicitly
    const logicalLines: string[] = [];
    let buffer = '';
    for (const rawLine of lines) {
      const trimmedRight = rawLine.replace(/\s+$/, '');
      if (trimmedRight.endsWith('\\')) {
        buffer += trimmedRight.slice(0, -1) + ' ';
      } else {
        logicalLines.push(buffer + rawLine);
        buffer = '';
      }
    }
    if (buffer) logicalLines.push(buffer);

    for (const line of logicalLines) {
      const parsed = parsePep508Specifier(line);
      if (!parsed) continue;
      const dedupeKey = `${parsed.name.toLowerCase()}::${category}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      dependencies.push({
        name: parsed.name,
        version: parsed.version,
        declaredVersion: parsed.version,
        sourceFile: cleanPath,
        ecosystem: 'pip',
        category,
        isDirect: true,
        isTransitive: false,
        manifestType: 'requirements.txt'
      });
    }

    return {
      manifest: {
        manifestPath: cleanPath,
        ecosystem: 'pip',
        manifestType: 'requirements.txt',
        status: 'PARSED',
        dependenciesCount: dependencies.length
      },
      dependencies
    };
  }
};

const pyprojectTomlParser: ManifestParser = {
  id: 'pip-pyproject-toml',
  ecosystem: 'pip',
  manifestType: 'pyproject.toml',
  canParse(filePath: string): boolean {
    return !isIgnoredPath(filePath) && getBaseName(filePath) === 'pyproject.toml';
  },
  parse(filePath: string, content: string): ParsedManifestOutput {
    const cleanPath = normalizePosixPath(filePath);
    try {
      const parsed = parseToml(content) as Record<string, unknown>;
      const dependencies: DependencyItem[] = [];
      let workspaceName: string | undefined;

      // PEP 621 [project]
      const projectSection = parsed.project as Record<string, unknown> | undefined;
      if (projectSection && typeof projectSection === 'object') {
        if (typeof projectSection.name === 'string') {
          workspaceName = projectSection.name;
        }
        if (Array.isArray(projectSection.dependencies)) {
          for (const entry of projectSection.dependencies) {
            if (typeof entry !== 'string') continue;
            const dep = parsePep508Specifier(entry);
            if (!dep) continue;
            dependencies.push({
              name: dep.name,
              version: dep.version,
              declaredVersion: dep.version,
              sourceFile: cleanPath,
              ecosystem: 'pip',
              category: 'dependencies',
              isDirect: true,
              isTransitive: false,
              workspaceName,
              manifestType: 'pyproject.toml'
            });
          }
        }
        const optDeps = projectSection['optional-dependencies'] as Record<string, unknown> | undefined;
        if (optDeps && typeof optDeps === 'object') {
          for (const [groupName, groupList] of Object.entries(optDeps)) {
            if (!Array.isArray(groupList)) continue;
            const cat: DependencyCategory = /dev|test|lint|doc/i.test(groupName)
              ? 'devDependencies'
              : 'optionalDependencies';
            for (const entry of groupList) {
              if (typeof entry !== 'string') continue;
              const dep = parsePep508Specifier(entry);
              if (!dep) continue;
              dependencies.push({
                name: dep.name,
                version: dep.version,
                declaredVersion: dep.version,
                sourceFile: cleanPath,
                ecosystem: 'pip',
                category: cat,
                isDirect: true,
                isTransitive: false,
                workspaceName,
                manifestType: 'pyproject.toml'
              });
            }
          }
        }
      }

      // Poetry [tool.poetry]
      const tool = parsed.tool as Record<string, unknown> | undefined;
      const poetry = tool?.poetry as Record<string, unknown> | undefined;
      if (poetry && typeof poetry === 'object') {
        if (!workspaceName && typeof poetry.name === 'string') {
          workspaceName = poetry.name;
        }

        const addPoetrySection = (section: unknown, defaultCategory: DependencyCategory) => {
          if (!section || typeof section !== 'object') return;
          for (const [pkgName, rawVal] of Object.entries(section as Record<string, unknown>)) {
            if (pkgName.toLowerCase() === 'python') continue;
            let version = 'unspecified';
            let category = defaultCategory;
            if (typeof rawVal === 'string') {
              version = rawVal;
            } else if (rawVal && typeof rawVal === 'object') {
              const obj = rawVal as Record<string, unknown>;
              if (typeof obj.version === 'string') version = obj.version;
              else if (typeof obj.git === 'string') version = `git:${obj.git}`;
              else if (typeof obj.path === 'string') version = `path:${obj.path}`;
              if (obj.optional === true) category = 'optionalDependencies';
            }
            dependencies.push({
              name: pkgName,
              version,
              declaredVersion: version,
              sourceFile: cleanPath,
              ecosystem: 'pip',
              category,
              isDirect: true,
              isTransitive: false,
              workspaceName,
              manifestType: 'pyproject.toml'
            });
          }
        };

        addPoetrySection(poetry.dependencies, 'dependencies');
        addPoetrySection(poetry['dev-dependencies'], 'devDependencies');

        const groups = poetry.group as Record<string, unknown> | undefined;
        if (groups && typeof groups === 'object') {
          for (const [groupName, groupBody] of Object.entries(groups)) {
            if (!groupBody || typeof groupBody !== 'object') continue;
            const cat: DependencyCategory = /dev|test|lint/i.test(groupName)
              ? 'devDependencies'
              : 'optionalDependencies';
            addPoetrySection((groupBody as Record<string, unknown>).dependencies, cat);
          }
        }
      }

      return {
        manifest: {
          manifestPath: cleanPath,
          ecosystem: 'pip',
          manifestType: 'pyproject.toml',
          workspaceName,
          status: 'PARSED',
          dependenciesCount: dependencies.length
        },
        dependencies
      };
    } catch (err: unknown) {
      return {
        manifest: {
          manifestPath: cleanPath,
          ecosystem: 'pip',
          manifestType: 'pyproject.toml',
          status: 'MALFORMED',
          error: err instanceof Error ? err.message : 'Invalid TOML syntax',
          dependenciesCount: 0
        },
        dependencies: []
      };
    }
  }
};

const goModParser: ManifestParser = {
  id: 'go-mod',
  ecosystem: 'go',
  manifestType: 'go.mod',
  canParse(filePath: string): boolean {
    return !isIgnoredPath(filePath) && getBaseName(filePath) === 'go.mod';
  },
  parse(filePath: string, content: string): ParsedManifestOutput {
    const cleanPath = normalizePosixPath(filePath);
    const dependencies: DependencyItem[] = [];
    const indirectDependencies: TransitiveDependencyItem[] = [];
    let workspaceName: string | undefined;
    let inRequireBlock = false;

    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const commentIdx = rawLine.indexOf('//');
      const comment = commentIdx >= 0 ? rawLine.slice(commentIdx + 2).trim() : '';
      const code = (commentIdx >= 0 ? rawLine.slice(0, commentIdx) : rawLine).trim();
      if (!code) continue;

      if (code.startsWith('module ')) {
        workspaceName = code.slice('module '.length).trim();
        continue;
      }

      if (/^require\s*\($/.test(code)) {
        inRequireBlock = true;
        continue;
      }

      if (inRequireBlock) {
        if (code === ')') {
          inRequireBlock = false;
          continue;
        }
        const parts = code.split(/\s+/);
        if (parts.length >= 2) {
          const [pkgName, version] = parts;
          if (comment.toLowerCase().includes('indirect')) {
            indirectDependencies.push({
              name: pkgName,
              resolvedVersion: version,
              ecosystem: 'go',
              lockfilePath: cleanPath
            });
          } else {
            dependencies.push({
              name: pkgName,
              version,
              declaredVersion: version,
              resolvedVersion: version,
              sourceFile: cleanPath,
              ecosystem: 'go',
              category: 'dependencies',
              isDirect: true,
              isTransitive: false,
              workspaceName,
              manifestType: 'go.mod'
            });
          }
        }
        continue;
      }

      if (code.startsWith('require ')) {
        const rest = code.slice('require '.length).trim();
        const parts = rest.split(/\s+/);
        if (parts.length >= 2) {
          const [pkgName, version] = parts;
          if (comment.toLowerCase().includes('indirect')) {
            indirectDependencies.push({
              name: pkgName,
              resolvedVersion: version,
              ecosystem: 'go',
              lockfilePath: cleanPath
            });
          } else {
            dependencies.push({
              name: pkgName,
              version,
              declaredVersion: version,
              resolvedVersion: version,
              sourceFile: cleanPath,
              ecosystem: 'go',
              category: 'dependencies',
              isDirect: true,
              isTransitive: false,
              workspaceName,
              manifestType: 'go.mod'
            });
          }
        }
      }
    }

    return {
      manifest: {
        manifestPath: cleanPath,
        ecosystem: 'go',
        manifestType: 'go.mod',
        workspaceName,
        status: 'PARSED',
        dependenciesCount: dependencies.length
      },
      dependencies,
      indirectDependencies
    };
  }
};

const cargoTomlParser: ManifestParser = {
  id: 'cargo-toml',
  ecosystem: 'cargo',
  manifestType: 'Cargo.toml',
  canParse(filePath: string): boolean {
    return !isIgnoredPath(filePath) && getBaseName(filePath) === 'Cargo.toml';
  },
  parse(filePath: string, content: string): ParsedManifestOutput {
    const cleanPath = normalizePosixPath(filePath);
    try {
      const parsed = parseToml(content) as Record<string, unknown>;
      const pkgSection = parsed.package as Record<string, unknown> | undefined;
      const workspaceName = typeof pkgSection?.name === 'string' ? pkgSection.name : undefined;
      const dependencies: DependencyItem[] = [];

      const extractCargoSection = (section: unknown, defaultCategory: DependencyCategory) => {
        if (!section || typeof section !== 'object') return;
        for (const [depName, rawSpec] of Object.entries(section as Record<string, unknown>)) {
          let version = 'unspecified';
          let category = defaultCategory;
          if (typeof rawSpec === 'string') {
            version = rawSpec;
          } else if (rawSpec && typeof rawSpec === 'object') {
            const spec = rawSpec as Record<string, unknown>;
            if (typeof spec.version === 'string') version = spec.version;
            else if (typeof spec.path === 'string') version = `path:${spec.path}`;
            else if (typeof spec.git === 'string') version = `git:${spec.git}`;
            if (spec.optional === true) category = 'optionalDependencies';
          }
          dependencies.push({
            name: depName,
            version,
            declaredVersion: version,
            sourceFile: cleanPath,
            ecosystem: 'cargo',
            category,
            isDirect: true,
            isTransitive: false,
            workspaceName,
            manifestType: 'Cargo.toml'
          });
        }
      };

      extractCargoSection(parsed.dependencies, 'dependencies');
      extractCargoSection(parsed['dev-dependencies'], 'devDependencies');
      extractCargoSection(parsed['build-dependencies'], 'devDependencies');

      const workspaceSection = parsed.workspace as Record<string, unknown> | undefined;
      if (workspaceSection?.dependencies) {
        extractCargoSection(workspaceSection.dependencies, 'dependencies');
      }

      return {
        manifest: {
          manifestPath: cleanPath,
          ecosystem: 'cargo',
          manifestType: 'Cargo.toml',
          workspaceName,
          status: 'PARSED',
          dependenciesCount: dependencies.length
        },
        dependencies
      };
    } catch (err: unknown) {
      return {
        manifest: {
          manifestPath: cleanPath,
          ecosystem: 'cargo',
          manifestType: 'Cargo.toml',
          status: 'MALFORMED',
          error: err instanceof Error ? err.message : 'Invalid TOML syntax',
          dependenciesCount: 0
        },
        dependencies: []
      };
    }
  }
};

const pomXmlParser: ManifestParser = {
  id: 'maven-pom-xml',
  ecosystem: 'maven',
  manifestType: 'pom.xml',
  canParse(filePath: string): boolean {
    return !isIgnoredPath(filePath) && getBaseName(filePath) === 'pom.xml';
  },
  parse(filePath: string, content: string): ParsedManifestOutput {
    const cleanPath = normalizePosixPath(filePath);
    try {
      const parser = new XMLParser({
        ignoreAttributes: true,
        trimValues: true,
        isArray: (tagName) => tagName === 'dependency'
      });
      const parsed = parser.parse(content) as Record<string, unknown>;
      const project = parsed.project as Record<string, unknown> | undefined;
      if (!project || typeof project !== 'object') {
        return {
          manifest: {
            manifestPath: cleanPath,
            ecosystem: 'maven',
            manifestType: 'pom.xml',
            status: 'MALFORMED',
            error: 'Missing <project> root element in pom.xml',
            dependenciesCount: 0
          },
          dependencies: []
        };
      }

      const artifactId = typeof project.artifactId === 'string' ? project.artifactId : undefined;
      const groupId = typeof project.groupId === 'string' ? project.groupId : undefined;
      const workspaceName = groupId && artifactId ? `${groupId}:${artifactId}` : artifactId;

      // Read <properties> map for local property substitution (e.g. ${spring.version})
      const propsMap = new Map<string, string>();
      if (project.properties && typeof project.properties === 'object') {
        for (const [k, v] of Object.entries(project.properties as Record<string, unknown>)) {
          if (typeof v === 'string' || typeof v === 'number') {
            propsMap.set(k, String(v));
          }
        }
      }

      const resolveProp = (val: unknown): string => {
        if (typeof val !== 'string' && typeof val !== 'number') return 'unspecified';
        const str = String(val).trim();
        const match = str.match(/^\$\{([^}]+)\}$/);
        if (match && propsMap.has(match[1])) {
          return propsMap.get(match[1])!;
        }
        return str || 'unspecified';
      };

      const dependencies: DependencyItem[] = [];
      const depsContainer = project.dependencies as Record<string, unknown> | undefined;
      const depList = Array.isArray(depsContainer?.dependency) ? depsContainer.dependency : [];

      for (const rawDep of depList) {
        if (!rawDep || typeof rawDep !== 'object') continue;
        const dep = rawDep as Record<string, unknown>;
        const depGroup = typeof dep.groupId === 'string' ? dep.groupId.trim() : '';
        const depArtifact = typeof dep.artifactId === 'string' ? dep.artifactId.trim() : '';
        if (!depArtifact) continue;

        const name = depGroup ? `${depGroup}:${depArtifact}` : depArtifact;
        const version = resolveProp(dep.version);
        const scope = typeof dep.scope === 'string' ? dep.scope.toLowerCase() : 'compile';
        const isOptional = dep.optional === true || dep.optional === 'true';

        let category: DependencyCategory = 'dependencies';
        if (scope === 'test' || scope === 'provided') {
          category = 'devDependencies';
        } else if (isOptional) {
          category = 'optionalDependencies';
        }

        dependencies.push({
          name,
          version,
          declaredVersion: version,
          sourceFile: cleanPath,
          ecosystem: 'maven',
          category,
          isDirect: true,
          isTransitive: false,
          workspaceName,
          manifestType: 'pom.xml'
        });
      }

      return {
        manifest: {
          manifestPath: cleanPath,
          ecosystem: 'maven',
          manifestType: 'pom.xml',
          workspaceName,
          status: 'PARSED',
          dependenciesCount: dependencies.length
        },
        dependencies
      };
    } catch (err: unknown) {
      return {
        manifest: {
          manifestPath: cleanPath,
          ecosystem: 'maven',
          manifestType: 'pom.xml',
          status: 'MALFORMED',
          error: err instanceof Error ? err.message : 'Invalid XML syntax',
          dependenciesCount: 0
        },
        dependencies: []
      };
    }
  }
};

// ---------------------------------------------------------------------------
// Lockfile Parsers
// ---------------------------------------------------------------------------

const packageLockParser: LockfileParser = {
  id: 'npm-package-lock',
  ecosystem: 'npm',
  canParse(filePath: string): boolean {
    return !isIgnoredPath(filePath) && getBaseName(filePath) === 'package-lock.json';
  },
  parse(filePath: string, content: string): ParsedLockfileOutput {
    const cleanPath = normalizePosixPath(filePath);
    const resolvedByImporterAndName = new Map<string, string>();
    const resolvedByName = new Map<string, string>();
    const packages: ResolvedLockEntry[] = [];

    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
          lockfile: {
            lockfilePath: cleanPath,
            ecosystem: 'npm',
            status: 'MALFORMED',
            resolvedCount: 0,
            transitiveCount: 0,
            error: 'Root value in package-lock.json is not an object'
          },
          resolvedByImporterAndName,
          resolvedByName,
          packages
        };
      }

      // lockfileVersion 2 & 3 (`packages` object)
      const pkgMap = parsed.packages as Record<string, Record<string, unknown>> | undefined;
      if (pkgMap && typeof pkgMap === 'object') {
        for (const [pkgPath, info] of Object.entries(pkgMap)) {
          if (!pkgPath || !info || typeof info !== 'object') continue;
          const version = typeof info.version === 'string' ? info.version : undefined;
          if (!version) continue;

          const extracted = extractNodeModulesPackageName(pkgPath);
          if (!extracted) continue; // skips workspace root entries like "packages/web"

          if (!extracted.isNested) {
            resolvedByImporterAndName.set(`${extracted.importerPath}::${extracted.name}`, version);
          }
          if (!resolvedByName.has(extracted.name)) {
            resolvedByName.set(extracted.name, version);
          }
          packages.push({
            name: extracted.name,
            version,
            importerPath: extracted.importerPath
          });
        }
      } else if (parsed.dependencies && typeof parsed.dependencies === 'object') {
        // lockfileVersion 1 recursive `dependencies` tree
        const walkV1 = (deps: Record<string, unknown>, parentPackage?: string) => {
          for (const [pkgName, rawNode] of Object.entries(deps)) {
            if (!rawNode || typeof rawNode !== 'object') continue;
            const node = rawNode as Record<string, unknown>;
            const version = typeof node.version === 'string' ? node.version : undefined;
            if (version) {
              if (!parentPackage && !resolvedByName.has(pkgName)) {
                resolvedByName.set(pkgName, version);
              }
              packages.push({
                name: pkgName,
                version,
                importerPath: '.',
                parentPackage
              });
            }
            if (node.dependencies && typeof node.dependencies === 'object') {
              walkV1(node.dependencies as Record<string, unknown>, pkgName);
            }
          }
        };
        walkV1(parsed.dependencies as Record<string, unknown>);
      }

      return {
        lockfile: {
          lockfilePath: cleanPath,
          ecosystem: 'npm',
          status: 'PARSED',
          resolvedCount: packages.length,
          transitiveCount: 0
        },
        resolvedByImporterAndName,
        resolvedByName,
        packages
      };
    } catch (err: unknown) {
      return {
        lockfile: {
          lockfilePath: cleanPath,
          ecosystem: 'npm',
          status: 'MALFORMED',
          resolvedCount: 0,
          transitiveCount: 0,
          error: err instanceof Error ? err.message : 'Invalid JSON syntax'
        },
        resolvedByImporterAndName,
        resolvedByName,
        packages
      };
    }
  }
};

const pnpmLockParser: LockfileParser = {
  id: 'npm-pnpm-lock',
  ecosystem: 'npm',
  canParse(filePath: string): boolean {
    return !isIgnoredPath(filePath) && getBaseName(filePath) === 'pnpm-lock.yaml';
  },
  parse(filePath: string, content: string): ParsedLockfileOutput {
    const cleanPath = normalizePosixPath(filePath);
    const resolvedByImporterAndName = new Map<string, string>();
    const resolvedByName = new Map<string, string>();
    const packages: ResolvedLockEntry[] = [];

    try {
      const parsed = parseYaml(content) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== 'object') {
        return {
          lockfile: {
            lockfilePath: cleanPath,
            ecosystem: 'npm',
            status: 'MALFORMED',
            resolvedCount: 0,
            transitiveCount: 0,
            error: 'Empty or invalid YAML in pnpm-lock.yaml'
          },
          resolvedByImporterAndName,
          resolvedByName,
          packages
        };
      }

      const recordImporterDeps = (importerPath: string, section: unknown) => {
        if (!section || typeof section !== 'object') return;
        for (const [pkgName, rawVal] of Object.entries(section as Record<string, unknown>)) {
          let resolved: string | undefined;
          if (typeof rawVal === 'string') {
            resolved = stripPnpmVersionSuffix(rawVal);
          } else if (rawVal && typeof rawVal === 'object') {
            const v = (rawVal as Record<string, unknown>).version;
            if (typeof v === 'string') resolved = stripPnpmVersionSuffix(v);
          }
          if (resolved) {
            resolvedByImporterAndName.set(`${importerPath}::${pkgName}`, resolved);
            if (!resolvedByName.has(pkgName)) resolvedByName.set(pkgName, resolved);
          }
        }
      };

      if (parsed.importers && typeof parsed.importers === 'object') {
        for (const [impPath, impVal] of Object.entries(parsed.importers as Record<string, unknown>)) {
          if (!impVal || typeof impVal !== 'object') continue;
          const impObj = impVal as Record<string, unknown>;
          const normImp = impPath === '.' ? '.' : normalizePosixPath(impPath);
          recordImporterDeps(normImp, impObj.dependencies);
          recordImporterDeps(normImp, impObj.devDependencies);
          recordImporterDeps(normImp, impObj.optionalDependencies);
        }
      } else {
        // Older pnpm lockfile root-level maps
        recordImporterDeps('.', parsed.dependencies);
        recordImporterDeps('.', parsed.devDependencies);
        recordImporterDeps('.', parsed.optionalDependencies);
      }

      if (parsed.packages && typeof parsed.packages === 'object') {
        for (const pkgKey of Object.keys(parsed.packages as Record<string, unknown>)) {
          const parsedKey = parsePnpmPackageKey(pkgKey);
          if (!parsedKey) continue;
          if (!resolvedByName.has(parsedKey.name)) {
            resolvedByName.set(parsedKey.name, parsedKey.version);
          }
          packages.push({
            name: parsedKey.name,
            version: parsedKey.version
          });
        }
      }

      return {
        lockfile: {
          lockfilePath: cleanPath,
          ecosystem: 'npm',
          status: 'PARSED',
          resolvedCount: packages.length || resolvedByName.size,
          transitiveCount: 0
        },
        resolvedByImporterAndName,
        resolvedByName,
        packages
      };
    } catch (err: unknown) {
      return {
        lockfile: {
          lockfilePath: cleanPath,
          ecosystem: 'npm',
          status: 'MALFORMED',
          resolvedCount: 0,
          transitiveCount: 0,
          error: err instanceof Error ? err.message : 'Invalid YAML syntax'
        },
        resolvedByImporterAndName,
        resolvedByName,
        packages
      };
    }
  }
};

function splitYarnDescriptor(rawDescriptor: string): { name: string; specifier: string } | null {
  const cleaned = rawDescriptor.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return null;
  const searchStart = cleaned.startsWith('@') ? cleaned.indexOf('/') + 1 : 0;
  const atIdx = cleaned.indexOf('@', Math.max(0, searchStart));
  if (atIdx <= 0) return null;
  const name = cleaned.slice(0, atIdx);
  let specifier = cleaned.slice(atIdx + 1).trim();
  if (specifier.startsWith('npm:')) {
    specifier = specifier.slice(4);
  }
  return { name, specifier };
}

const yarnLockParser: LockfileParser = {
  id: 'npm-yarn-lock',
  ecosystem: 'npm',
  canParse(filePath: string): boolean {
    return !isIgnoredPath(filePath) && getBaseName(filePath) === 'yarn.lock';
  },
  parse(filePath: string, content: string): ParsedLockfileOutput {
    const cleanPath = normalizePosixPath(filePath);
    const resolvedByImporterAndName = new Map<string, string>();
    const resolvedByName = new Map<string, string>();
    const packages: ResolvedLockEntry[] = [];

    try {
      // Detect Yarn v2+ Berry YAML format
      if (/^__metadata:\s*$/m.test(content)) {
        const parsed = parseYaml(content) as Record<string, unknown> | null;
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Malformed Yarn Berry YAML');
        }
        for (const [header, entry] of Object.entries(parsed)) {
          if (header === '__metadata' || !entry || typeof entry !== 'object') continue;
          const version = typeof (entry as Record<string, unknown>).version === 'string'
            ? ((entry as Record<string, unknown>).version as string)
            : undefined;
          if (!version) continue;

          for (const rawDesc of header.split(',')) {
            const parsedDesc = splitYarnDescriptor(rawDesc);
            if (!parsedDesc) continue;
            resolvedByImporterAndName.set(`.${'::'}${parsedDesc.name}@${parsedDesc.specifier}`, version);
            if (!resolvedByName.has(parsedDesc.name)) {
              resolvedByName.set(parsedDesc.name, version);
            }
            packages.push({
              name: parsedDesc.name,
              version,
              specifier: parsedDesc.specifier
            });
          }
        }
      } else {
        // Yarn Classic v1 deterministic stanza parser
        const lines = content.split(/\r?\n/);
        let currentDescriptors: { name: string; specifier: string }[] = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) {
            if (!trimmed) currentDescriptors = [];
            continue;
          }

          if (!line.startsWith(' ') && !line.startsWith('\t') && trimmed.endsWith(':')) {
            const headerBody = trimmed.slice(0, -1);
            currentDescriptors = headerBody
              .split(',')
              .map((part) => splitYarnDescriptor(part))
              .filter((d): d is { name: string; specifier: string } => d !== null);
            continue;
          }

          if (currentDescriptors.length > 0 && /^\s+version\s+["']?([^"'\s]+)["']?/.test(line)) {
            const match = line.match(/^\s+version\s+["']?([^"'\s]+)["']?/);
            const version = match?.[1];
            if (version) {
              for (const desc of currentDescriptors) {
                resolvedByImporterAndName.set(`.::${desc.name}@${desc.specifier}`, version);
                if (!resolvedByName.has(desc.name)) {
                  resolvedByName.set(desc.name, version);
                }
                packages.push({
                  name: desc.name,
                  version,
                  specifier: desc.specifier
                });
              }
            }
          }
        }
      }

      return {
        lockfile: {
          lockfilePath: cleanPath,
          ecosystem: 'npm',
          status: 'PARSED',
          resolvedCount: packages.length,
          transitiveCount: 0
        },
        resolvedByImporterAndName,
        resolvedByName,
        packages
      };
    } catch (err: unknown) {
      return {
        lockfile: {
          lockfilePath: cleanPath,
          ecosystem: 'npm',
          status: 'MALFORMED',
          resolvedCount: 0,
          transitiveCount: 0,
          error: err instanceof Error ? err.message : 'Failed to parse yarn.lock'
        },
        resolvedByImporterAndName,
        resolvedByName,
        packages
      };
    }
  }
};

export const MANIFEST_PARSERS: ManifestParser[] = [
  packageJsonParser,
  requirementsTxtParser,
  pyprojectTomlParser,
  goModParser,
  cargoTomlParser,
  pomXmlParser
];

export const LOCKFILE_PARSERS: LockfileParser[] = [
  packageLockParser,
  pnpmLockParser,
  yarnLockParser
];

export function isSupportedManifestPath(filePath: string): boolean {
  return MANIFEST_PARSERS.some((parser) => parser.canParse(filePath));
}

export function isSupportedLockfilePath(filePath: string): boolean {
  return LOCKFILE_PARSERS.some((parser) => parser.canParse(filePath));
}

export function findSupportedManifestAndLockfilePaths(fileTree: FileTreeItem[]): {
  manifestPaths: FileTreeItem[];
  lockfilePaths: FileTreeItem[];
} {
  const manifestPaths: FileTreeItem[] = [];
  const lockfilePaths: FileTreeItem[] = [];

  for (const item of fileTree) {
    if (item.type !== 'file') continue;
    if (isSupportedManifestPath(item.path)) {
      manifestPaths.push(item);
    } else if (isSupportedLockfilePath(item.path)) {
      lockfilePaths.push(item);
    }
  }

  return { manifestPaths, lockfilePaths };
}

function getRelativeImporterPath(lockfileDir: string, manifestDir: string): string {
  if (lockfileDir === '.') return manifestDir;
  if (manifestDir === lockfileDir) return '.';
  if (manifestDir.startsWith(`${lockfileDir}/`)) {
    return manifestDir.slice(lockfileDir.length + 1);
  }
  return manifestDir;
}

/**
 * Pure deterministic parser entry point operating on fetched repository manifests and lockfiles.
 * Never invents fallback or stub packages. Preserves declared ranges, manifest paths,
 * categories, workspace names, resolved lockfile versions (when available), and separates
 * direct vs transitive dependencies.
 */
export function parseDependenciesFromFiles(
  manifestFiles: ManifestFileInput[],
  lockfileFiles: ManifestFileInput[] = [],
  failedFetches: Array<{ path: string; kind: 'manifest' | 'lockfile'; error: string }> = []
): DependencyExtractionResult {
  const directDependencies: DependencyItem[] = [];
  const transitiveDependencies: TransitiveDependencyItem[] = [];
  const manifests: ManifestParseResult[] = [];
  const lockfiles: LockfileParseResult[] = [];
  const warnings: string[] = [];

  const parsedLockfiles: Array<{
    path: string;
    dir: string;
    ecosystem: DependencyItem['ecosystem'];
    parsed: ParsedLockfileOutput;
  }> = [];

  for (const lockFile of lockfileFiles) {
    const parser = LOCKFILE_PARSERS.find((p) => p.canParse(lockFile.path));
    if (!parser) continue;
    const output = parser.parse(lockFile.path, lockFile.content);
    if (output.lockfile.status === 'MALFORMED' && output.lockfile.error) {
      warnings.push(`Malformed lockfile ${lockFile.path}: ${output.lockfile.error}`);
    }
    lockfiles.push(output.lockfile);
    parsedLockfiles.push({
      path: normalizePosixPath(lockFile.path),
      dir: getDirName(lockFile.path),
      ecosystem: parser.ecosystem,
      parsed: output
    });
  }

  for (const fail of failedFetches) {
    if (fail.kind === 'manifest') {
      manifests.push({
        manifestPath: normalizePosixPath(fail.path),
        ecosystem: 'other',
        manifestType: getBaseName(fail.path),
        status: 'FETCH_FAILED',
        error: fail.error,
        dependenciesCount: 0
      });
    } else {
      lockfiles.push({
        lockfilePath: normalizePosixPath(fail.path),
        ecosystem: 'other',
        status: 'FETCH_FAILED',
        resolvedCount: 0,
        transitiveCount: 0,
        error: fail.error
      });
    }
    warnings.push(`Failed to fetch ${fail.kind} ${fail.path}: ${fail.error}`);
  }

  // Parse all manifests
  for (const manifestFile of manifestFiles) {
    const parser = MANIFEST_PARSERS.find((p) => p.canParse(manifestFile.path));
    if (!parser) continue;

    const output = parser.parse(manifestFile.path, manifestFile.content);
    manifests.push(output.manifest);
    if (output.manifest.status === 'MALFORMED' && output.manifest.error) {
      warnings.push(`Malformed manifest ${manifestFile.path}: ${output.manifest.error}`);
    }

    if (output.indirectDependencies?.length) {
      for (const ind of output.indirectDependencies) {
        transitiveDependencies.push(ind);
      }
    }

    const manifestDir = getDirName(manifestFile.path);
    const matchingLockfiles = parsedLockfiles
      .filter(
        (lf) =>
          lf.ecosystem === parser.ecosystem &&
          lf.parsed.lockfile.status === 'PARSED' &&
          (lf.dir === '.' || lf.dir === manifestDir || manifestDir.startsWith(`${lf.dir}/`))
      )
      .sort((a, b) => b.dir.length - a.dir.length); // nearest directory lockfile first

    for (const dep of output.dependencies) {
      let resolvedVersion = dep.resolvedVersion;
      let lockfileSource: string | undefined;

      if (!resolvedVersion && matchingLockfiles.length > 0) {
        for (const lf of matchingLockfiles) {
          const relImporter = getRelativeImporterPath(lf.dir, manifestDir);
          const candidateByDescriptor = lf.parsed.resolvedByImporterAndName.get(
            `${relImporter}::${dep.name}@${dep.declaredVersion || dep.version}`
          );
          const candidateByImporter = lf.parsed.resolvedByImporterAndName.get(
            `${relImporter}::${dep.name}`
          );
          const candidateByName = lf.parsed.resolvedByName.get(dep.name);

          const matched = candidateByDescriptor || candidateByImporter || candidateByName;
          if (matched) {
            resolvedVersion = matched;
            lockfileSource = lf.path;
            break;
          }
        }
      }

      directDependencies.push({
        ...dep,
        declaredVersion: dep.declaredVersion || dep.version,
        resolvedVersion,
        lockfileSource,
        isDirect: true,
        isTransitive: false
      });
    }
  }

  // Collect transitive dependencies strictly from parsed lockfiles excluding direct declarations
  const directNameSetByEcosystem = new Map<DependencyItem['ecosystem'], Set<string>>();
  for (const dep of directDependencies) {
    if (!directNameSetByEcosystem.has(dep.ecosystem)) {
      directNameSetByEcosystem.set(dep.ecosystem, new Set());
    }
    directNameSetByEcosystem.get(dep.ecosystem)!.add(dep.name);
  }

  const seenTransitive = new Set<string>();
  for (const ind of transitiveDependencies) {
    seenTransitive.add(`${ind.ecosystem}:${ind.name}@${ind.resolvedVersion}`);
  }

  for (const lf of parsedLockfiles) {
    if (lf.parsed.lockfile.status !== 'PARSED') continue;
    const directNames = directNameSetByEcosystem.get(lf.ecosystem) || new Set<string>();
    let lfTransitiveCount = 0;

    for (const entry of lf.parsed.packages) {
      if (directNames.has(entry.name)) {
        continue;
      }
      const dedupeKey = `${lf.ecosystem}:${entry.name}@${entry.version}`;
      if (seenTransitive.has(dedupeKey)) continue;
      seenTransitive.add(dedupeKey);

      transitiveDependencies.push({
        name: entry.name,
        resolvedVersion: entry.version,
        ecosystem: lf.ecosystem,
        lockfilePath: lf.path,
        parentPackage: entry.parentPackage
      });
      lfTransitiveCount++;
    }

    lf.parsed.lockfile.transitiveCount = lfTransitiveCount;
  }

  return {
    directDependencies,
    transitiveDependencies,
    manifests,
    lockfiles,
    warnings
  };
}

