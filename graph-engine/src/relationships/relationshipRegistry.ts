/**
 * EngiTrace Engineering Memory Graph - Controlled Relationship Registry
 */

export enum StandardRelationship {
  CHANGED = 'CHANGED',
  MODIFIED = 'MODIFIED',
  AUTHORED_BY = 'AUTHORED_BY',
  IMPLEMENTED = 'IMPLEMENTED',
  RESOLVES = 'RESOLVES',
  DEPENDS_ON = 'DEPENDS_ON',
  CONTAINS = 'CONTAINS',
  IMPORTS = 'IMPORTS',
  CALLS = 'CALLS',
  DECLARES = 'DECLARES',
  EXPOSES = 'EXPOSES',
  REFERENCES = 'REFERENCES',
  RELATED_TO = 'RELATED_TO',
  PARENT_OF = 'PARENT_OF'
}

export type ExtensionRelationship =
  | 'CAUSED'
  | 'MOTIVATED'
  | 'INTRODUCED'
  | 'REPLACED'
  | 'DEPRECATED'
  | 'RESULTED_IN';

export type RelationshipType = StandardRelationship | ExtensionRelationship;

export interface RelationshipMetadata {
  type: string;
  description: string;
  allowedSourceTypes: string[];
  allowedTargetTypes: string[];
}

export class RelationshipRegistry {
  private static registeredTypes: Map<string, RelationshipMetadata> = new Map([
    [
      StandardRelationship.CHANGED,
      {
        type: StandardRelationship.CHANGED,
        description: 'Pull Request or Commit modified/changed a file',
        allowedSourceTypes: ['COMMIT', 'PULL_REQUEST'],
        allowedTargetTypes: ['FILE']
      }
    ],
    [
      StandardRelationship.MODIFIED,
      {
        type: StandardRelationship.MODIFIED,
        description: 'Commit modified a file in codebase',
        allowedSourceTypes: ['COMMIT'],
        allowedTargetTypes: ['FILE', 'REPOSITORY']
      }
    ],
    [
      StandardRelationship.AUTHORED_BY,
      {
        type: StandardRelationship.AUTHORED_BY,
        description: 'Commit or PR was created by an Author',
        allowedSourceTypes: ['COMMIT', 'PULL_REQUEST'],
        allowedTargetTypes: ['AUTHOR']
      }
    ],
    [
      StandardRelationship.IMPLEMENTED,
      {
        type: StandardRelationship.IMPLEMENTED,
        description: 'PR implemented a Commit',
        allowedSourceTypes: ['PULL_REQUEST'],
        allowedTargetTypes: ['COMMIT']
      }
    ],
    [
      StandardRelationship.RESOLVES,
      {
        type: StandardRelationship.RESOLVES,
        description: 'PR or Commit resolves an Issue',
        allowedSourceTypes: ['PULL_REQUEST', 'COMMIT'],
        allowedTargetTypes: ['ISSUE']
      }
    ],
    [
      StandardRelationship.DEPENDS_ON,
      {
        type: StandardRelationship.DEPENDS_ON,
        description: 'File or Repository depends on a package/module',
        allowedSourceTypes: ['FILE', 'REPOSITORY'],
        allowedTargetTypes: ['DEPENDENCY', 'FILE']
      }
    ],
    [
      StandardRelationship.CONTAINS,
      {
        type: StandardRelationship.CONTAINS,
        description: 'Repository contains a File, or Component/File contains a nested Component',
        allowedSourceTypes: ['REPOSITORY', 'FILE', 'COMPONENT'],
        allowedTargetTypes: ['FILE', 'COMPONENT']
      }
    ],
    [
      StandardRelationship.IMPORTS,
      {
        type: StandardRelationship.IMPORTS,
        description: 'Source file statically imports a verified repository target file',
        allowedSourceTypes: ['FILE'],
        allowedTargetTypes: ['FILE']
      }
    ],
    [
      StandardRelationship.CALLS,
      {
        type: StandardRelationship.CALLS,
        description: 'Function, Component, or File statically invokes another verified Function or Component',
        allowedSourceTypes: ['FUNCTION', 'COMPONENT', 'FILE'],
        allowedTargetTypes: ['FUNCTION', 'COMPONENT']
      }
    ],
    [
      StandardRelationship.DECLARES,
      {
        type: StandardRelationship.DECLARES,
        description: 'Source file declares a Function, Method, Class, or Component symbol',
        allowedSourceTypes: ['FILE'],
        allowedTargetTypes: ['FUNCTION', 'COMPONENT']
      }
    ],
    [
      StandardRelationship.EXPOSES,
      {
        type: StandardRelationship.EXPOSES,
        description: 'Source file exports a public Function, Class, or Component symbol',
        allowedSourceTypes: ['FILE'],
        allowedTargetTypes: ['FUNCTION', 'COMPONENT']
      }
    ],
    [
      StandardRelationship.REFERENCES,
      {
        type: StandardRelationship.REFERENCES,
        description: 'Commit or PR references an Issue, PR, or File',
        allowedSourceTypes: ['COMMIT', 'PULL_REQUEST'],
        allowedTargetTypes: ['ISSUE', 'PULL_REQUEST', 'FILE', 'REPOSITORY']
      }
    ],
    [
      StandardRelationship.RELATED_TO,
      {
        type: StandardRelationship.RELATED_TO,
        description: 'General evidence-backed historical connection',
        allowedSourceTypes: ['COMMIT', 'PULL_REQUEST', 'ISSUE', 'FILE', 'DECISION', 'INCIDENT'],
        allowedTargetTypes: ['COMMIT', 'PULL_REQUEST', 'ISSUE', 'FILE', 'DECISION', 'INCIDENT']
      }
    ],
    [
      StandardRelationship.PARENT_OF,
      {
        type: StandardRelationship.PARENT_OF,
        description: 'Parent commit node preceded child commit node in Git history',
        allowedSourceTypes: ['COMMIT'],
        allowedTargetTypes: ['COMMIT']
      }
    ]
  ]);

  /**
   * Check if relationship string is registered
   */
  static isRegistered(type: string): boolean {
    return this.registeredTypes.has(type.toUpperCase());
  }

  /**
   * Register new relationship extension
   */
  static register(metadata: RelationshipMetadata): void {
    this.registeredTypes.set(metadata.type.toUpperCase(), metadata);
  }

  /**
   * Retrieve relationship metadata
   */
  static getMetadata(type: string): RelationshipMetadata | undefined {
    return this.registeredTypes.get(type.toUpperCase());
  }

  /**
   * Get all registered relationship types
   */
  static getAllTypes(): string[] {
    return Array.from(this.registeredTypes.keys());
  }
}
