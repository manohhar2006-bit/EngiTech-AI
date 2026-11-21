import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { EeidGraphIngestionService } from '../src/services/eeidGraphIngestionService';
import { GraphRepository } from '../src/services/graphRepository';
import { RepositoryController } from '../src/controllers/repositoryController';
import { MultiFileContextService } from '../src/services/multiFileContextService';

describe('EEID Runtime Graph Ingestion & Isolation', () => {
  before(() => {
    // Ingest all 3 EEID pilot repositories
    const success = EeidGraphIngestionService.ingestEeidRepositories();
    assert.equal(success, true, 'EeidGraphIngestionService must successfully ingest repositories');
  });

  it('preserves exact node, edge, and source file counts for all 3 EEID pilot repositories', () => {
    const summaries = EeidGraphIngestionService.getSummaries();
    assert.equal(summaries.length, 3, 'Must have exactly 3 EEID pilot repositories');

    // 1. EEID-REPO-001: Express
    const express = summaries.find((s) => s.repositoryId === 'EEID-REPO-001');
    assert.ok(express, 'EEID-REPO-001 must be present');
    assert.equal(express.name, 'expressjs/express');
    assert.equal(express.pinnedCommitSha, '43fca52d28a422c8be48fd489cbd4f2d6152bab6');
    assert.equal(express.snapshotTimestamp, '2026-11-02T20:15:26Z');
    assert.equal(express.nodeCount, 136, 'Express must have 136 nodes');
    assert.equal(express.edgeCount, 178, 'Express must have 178 edges');
    assert.equal(express.sourceFileCount, 53, 'Express must have 53 source files');

    // 2. EEID-REPO-002: TanStack Query
    const tanstack = summaries.find((s) => s.repositoryId === 'EEID-REPO-002');
    assert.ok(tanstack, 'EEID-REPO-002 must be present');
    assert.equal(tanstack.name, 'TanStack/query');
    assert.equal(tanstack.pinnedCommitSha, '19f555cf919a1438885d7d20c95b17b26d6d6859');
    assert.equal(tanstack.snapshotTimestamp, '2026-11-13T01:57:29Z');
    assert.equal(tanstack.nodeCount, 399, 'TanStack Query must have 399 nodes');
    assert.equal(tanstack.edgeCount, 1016, 'TanStack Query must have 1016 edges');
    assert.equal(tanstack.sourceFileCount, 49, 'TanStack Query must have 49 source files');

    // 3. EEID-REPO-003: Payload CMS
    const payload = summaries.find((s) => s.repositoryId === 'EEID-REPO-003');
    assert.ok(payload, 'EEID-REPO-003 must be present');
    assert.equal(payload.name, 'payloadcms/payload');
    assert.equal(payload.pinnedCommitSha, '90b4962a1876cbd3568692e7de9aaf72b847e407');
    assert.equal(payload.snapshotTimestamp, '2026-11-13T16:18:53Z');
    assert.equal(payload.nodeCount, 305, 'Payload CMS must have 305 nodes');
    assert.equal(payload.edgeCount, 593, 'Payload CMS must have 593 edges');
    assert.equal(payload.sourceFileCount, 64, 'Payload CMS must have 64 source files');
  });

  it('resolves nodes and preserves metadata in GraphRepository', () => {
    // Node lookup in EEID-REPO-001
    const node1 = GraphRepository.getNode('EEID-REPO-001', 'file:EEID-REPO-001:History.md');
    assert.ok(node1, 'History.md node must exist');
    assert.equal(node1.type, 'FILE');
    assert.equal(node1.metadata.path, 'History.md');

    // Node lookup in EEID-REPO-002
    const repoNode2 = GraphRepository.getNode('EEID-REPO-002', 'repository:TanStack/query');
    assert.ok(repoNode2, 'TanStack/query repository node must exist');
    assert.equal(repoNode2.type, 'REPOSITORY');

    // Node lookup in EEID-REPO-003
    const repoNode3 = GraphRepository.getNode('EEID-REPO-003', 'repository:payloadcms/payload');
    assert.ok(repoNode3, 'payloadcms/payload repository node must exist');
    assert.equal(repoNode3.type, 'REPOSITORY');
  });

  it('resolves graphs via repository slugs and aliases', () => {
    // EEID-REPO-001 aliases
    assert.ok(GraphRepository.getGraph('express'));
    assert.ok(GraphRepository.getGraph('expressjs/express'));
    assert.ok(RepositoryController.getSnapshot('express'));
    assert.ok(RepositoryController.getSnapshot('EEID-REPO-001'));

    // EEID-REPO-002 aliases
    assert.ok(GraphRepository.getGraph('tanstack-query'));
    assert.ok(GraphRepository.getGraph('TanStack/query'));
    assert.ok(RepositoryController.getSnapshot('tanstack-query'));
    assert.ok(RepositoryController.getSnapshot('EEID-REPO-002'));

    // EEID-REPO-003 aliases
    assert.ok(GraphRepository.getGraph('payload'));
    assert.ok(GraphRepository.getGraph('payloadcms/payload'));
    assert.ok(RepositoryController.getSnapshot('payload'));
    assert.ok(RepositoryController.getSnapshot('EEID-REPO-003'));
  });

  it('provides offline source retrieval from snapshot without network requests', async () => {
    const snapshot = RepositoryController.getSnapshot('EEID-REPO-001');
    assert.ok(snapshot, 'EEID-REPO-001 snapshot must exist');
    assert.ok(snapshot.sourceContents, 'sourceContents must be defined on snapshot');
    assert.ok(snapshot.sourceContents.has('History.md'), 'History.md must be in sourceContents');
    assert.ok(snapshot.sourceContents.has('Readme.md'), 'Readme.md must be in sourceContents');

    const graph = GraphRepository.getGraph('EEID-REPO-001');
    assert.ok(graph, 'EEID-REPO-001 graph must exist');

    const result = await MultiFileContextService.retrieveBoundedContext({
      repositoryId: 'EEID-REPO-001',
      canonicalRepoId: 'EEID-REPO-001',
      owner: 'expressjs',
      repo: 'express',
      branch: 'master',
      selectedFilePath: 'History.md',
      nodeId: 'file:EEID-REPO-001:History.md',
      analysisType: 'WHY',
      question: 'Explain History.md in express',
      graph,
      snapshot
    });

    assert.ok(result.selectedFile, 'selectedFile must be retrieved');
    assert.ok(['RETRIEVED', 'TRUNCATED'].includes(result.selectedFile.status), `status should be RETRIEVED or TRUNCATED, got ${result.selectedFile.status}`);
    assert.equal(result.selectedFile.filePath, 'History.md');
    assert.ok(result.selectedFile.content, 'Content must be loaded');
    assert.match(result.selectedFile.content, /body-parser|express/i);
  });

  it('enforces strict cross-repository isolation (zero evidence contamination)', () => {
    const graph1 = GraphRepository.getGraph('EEID-REPO-001')!;
    const graph2 = GraphRepository.getGraph('EEID-REPO-002')!;
    const graph3 = GraphRepository.getGraph('EEID-REPO-003')!;

    // EEID-REPO-001 isolation
    for (const node of graph1.nodes) {
      assert.ok(!node.id.includes('TanStack'), `Node ${node.id} in repo 1 must not reference TanStack`);
      assert.ok(!node.id.includes('payload'), `Node ${node.id} in repo 1 must not reference payload`);
    }

    // EEID-REPO-002 isolation
    for (const node of graph2.nodes) {
      assert.ok(!node.id.includes('expressjs'), `Node ${node.id} in repo 2 must not reference expressjs`);
      assert.ok(!node.id.includes('payload'), `Node ${node.id} in repo 2 must not reference payload`);
    }

    // EEID-REPO-003 isolation
    for (const node of graph3.nodes) {
      assert.ok(!node.id.includes('expressjs'), `Node ${node.id} in repo 3 must not reference expressjs`);
      assert.ok(!node.id.includes('TanStack'), `Node ${node.id} in repo 3 must not reference TanStack`);
    }
  });
});
