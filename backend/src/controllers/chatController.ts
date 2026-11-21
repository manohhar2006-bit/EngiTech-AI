import { Request, Response } from 'express';
import { WhyExplorerService } from '../services/whyExplorerService';
import { ImpactAnalysisService } from '../services/impactAnalysisService';
import { GraphRepository } from '../services/graphRepository';
import { MultiFileContextService, MultiFileContextResult } from '../services/multiFileContextService';
import { RepositoryController } from './repositoryController';
import { GitHubService } from '../services/githubService';
import { EvidenceContextBuilder } from '../../../ai-engine/services/evidenceContextBuilder';
import { ProviderService } from '../../../ai-engine/services/providerService';
import { StructuredOutputValidator } from '../../../ai-engine/validators/structuredOutputValidator';
import { AIContext } from '../../../ai-engine/types/aiContext';
import { ImpactResult } from '../types/impactTypes';
import { NormalizedEvidence } from '../types/evidence';
import { redactSecrets } from '../security/secretRedactor';

function cleanNodeFilePath(rawPath?: string | null): string | null {
  if (!rawPath || typeof rawPath !== 'string') return null;
  let cleaned = rawPath.trim();

  // Support node URI prefixes: file:REPO:path, function:REPO:path:func:line, component:REPO:path:comp
  if (/^(file|function|component|symbol):/i.test(cleaned)) {
    const parts = cleaned.split(':');
    if (parts.length >= 3) {
      cleaned = parts[2];
    } else {
      cleaned = cleaned.replace(/^(file|function|component|symbol):/i, '');
    }
  }

  cleaned = cleaned.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('..')) return null;
  return cleaned;
}

function resolveOwnerAndRepo(repositoryId: string, snapshot?: any): { owner: string; repo: string } {
  if (snapshot?.metadata?.owner && snapshot?.metadata?.repo) {
    return { owner: snapshot.metadata.owner, repo: snapshot.metadata.repo };
  }
  const decoded = decodeURIComponent(repositoryId).trim();
  if (decoded.includes('/')) {
    const parts = decoded.split('/');
    return { owner: parts[0], repo: parts[1] };
  }
  const clean = decoded.replace(/^repo-/, '');
  if (clean.includes('-')) {
    if (clean === 'engitrace-core' || clean === 'codeorigin-core') return { owner: 'codeorigin', repo: 'engineering-core' };
    if (clean === 'payment-gateway') return { owner: 'codeorigin', repo: 'payment-gateway' };
    if (clean === 'facebook-react') return { owner: 'facebook', repo: 'react' };
    const parts = clean.split('-');
    return { owner: parts[0], repo: parts.slice(1).join('-') };
  }
  return { owner: clean, repo: clean };
}

function buildEmptyValidationContext(repositoryId: string, nodeId: string, question: string): AIContext {
  const now = new Date().toISOString();
  return {
    target: {
      id: nodeId,
      type: 'FILE',
      label: nodeId,
      metadata: {},
      sourceReference: nodeId,
      createdAt: now,
      updatedAt: now
    },
    question,
    historicalChain: [],
    evidence: [],
    facts: [],
    inferences: [],
    unknowns: [],
    relationships: [],
    metadata: {
      repositoryId,
      totalEvidenceCount: 0,
      contextBuiltAt: now
    },
    sourceLinks: []
  };
}

function buildWhyValidationContext(context: AIContext, targetNodeId: string, canonicalRepoId: string): AIContext {
  // WhyExplorerService assigns targetNode.id as placeholder repositoryId; normalize only that placeholder
  const scopedEvidence: NormalizedEvidence[] = context.evidence.map((ev) => ({
    ...ev,
    repositoryId: ev.repositoryId === targetNodeId ? canonicalRepoId : ev.repositoryId
  }));

  return {
    ...context,
    evidence: scopedEvidence,
    metadata: {
      ...context.metadata,
      repositoryId: canonicalRepoId
    }
  };
}

function buildWhatIfValidationContext(
  impactResult: ImpactResult,
  canonicalRepoId: string,
  question: string,
  maxEvidenceItems = 15
): AIContext {
  const boundedEvidence: NormalizedEvidence[] = impactResult.evidence.slice(0, maxEvidenceItems).map((item) => ({
    id: item.id,
    repositoryId: canonicalRepoId,
    source: item.sourceId,
    target: item.targetId,
    relationshipType: item.relationshipType,
    classification: item.classification,
    confidence: item.confidence,
    title: `${item.relationshipType}: ${item.sourceId} -> ${item.targetId}`,
    description: item.evidence,
    sourceUrl: item.sourceUrl || '',
    timestamp: item.timestamp || impactResult.analyzedAt
  }));

  return {
    target: impactResult.target,
    question,
    historicalChain: [],
    evidence: boundedEvidence,
    facts: [],
    inferences: [],
    unknowns: impactResult.warnings.map((reason, idx) => ({
      id: `unk-imp-${idx + 1}`,
      area: 'Impact Analysis Boundary',
      reason
    })),
    relationships: impactResult.relationships.map((edge) => ({
      source: edge.source,
      target: edge.target,
      type: edge.relationshipType
    })),
    metadata: {
      repositoryId: canonicalRepoId,
      totalEvidenceCount: impactResult.evidence.length,
      contextBuiltAt: impactResult.analyzedAt
    },
    sourceLinks: []
  };
}

export class ChatController {
  /**
   * POST /api/v1/repositories/:id/chat
   */
  static async handleChat(req: Request, res: Response): Promise<void> {
    try {
      const repositoryId = req.params.id;
      const { nodeId, analysisType, messages, nodeMetadata } = req.body as {
        nodeId?: string;
        analysisType?: 'WHY' | 'WHAT_IF';
        messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
        nodeMetadata?: Record<string, any>;
      };

      if (!nodeId || !messages || !Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Missing required parameters: nodeId and messages are required.' });
        return;
      }

      const lastUserQuestion = messages[messages.length - 1].content;

      console.log(`\n========================================================`);
      console.log(`[CHAT_REQUEST_RECEIVED]`);
      console.log(`→ Repository ID: ${repositoryId}`);
      console.log(`→ Node ID: ${nodeId}`);
      console.log(`→ Messages Count: ${messages.length}`);
      console.log(`→ User Question: "${lastUserQuestion}"`);

      // 1. Dynamic Question-Aware Routing
      const qLower = lastUserQuestion.toLowerCase().trim();

      // Lightweight Conversational Greeting Shortcut (Saves Gemini Quota)
      if (['hello', 'hi', 'hey', 'greetings', 'thanks', 'thank you', 'okay', 'ok'].includes(qLower)) {
        console.log(`→ Conversational Greeting ("${lastUserQuestion}"). Returning lightweight response without Gemini analysis call.`);
        console.log(`========================================================\n`);
        const targetLabel = nodeId.split('/').pop() || nodeId;
        res.json({
          answer: `Hi! You're currently exploring **${targetLabel}** in repository \`${repositoryId}\`.\n\nI can explain its purpose, commit history, graph connections, or what would happen if it is removed. What would you like to know?`,
          claims: [],
          suggestedFollowUps: [
            `Why does ${targetLabel} exist?`,
            `Which commit changed ${targetLabel}?`,
            `What depends on ${targetLabel}?`,
            `What happens if I remove ${targetLabel}?`
          ],
          provider: 'LOCAL_FALLBACK',
          model: 'engitrace-lightweight-conversational',
          isFallback: true
        });
        return;
      }

      let forceAnalysisType: 'WHY' | 'WHAT_IF' | null = null;

      if (
        qLower.includes('remove') ||
        qLower.includes('delete') ||
        qLower.includes('what if') ||
        qLower.includes('happen if') ||
        qLower.includes('impact') ||
        qLower.includes('break') ||
        qLower.includes('mitigate')
      ) {
        forceAnalysisType = 'WHAT_IF';
      } else if (
        qLower.includes('why') ||
        qLower.includes('exist') ||
        qLower.includes('purpose') ||
        qLower.includes('history') ||
        qLower.includes('who') ||
        qLower.includes('commit') ||
        qLower.includes('author') ||
        qLower.includes('when') ||
        qLower.includes('introduce') ||
        qLower.includes('timeline')
      ) {
        forceAnalysisType = 'WHY';
      }

      const activeAnalysisType = forceAnalysisType || analysisType || 'WHY';
      console.log(`→ Active Analysis Mode: ${activeAnalysisType}`);

      // 2. Fetch Graph Node & Neighborhood Details
      console.log(`→ Retrieval Started: Fetching graph topology & evidence...`);
      const graph = GraphRepository.getGraph(repositoryId);
      const graphNode = graph?.nodes.find(
        (n) =>
          n.id === nodeId ||
          n.label.toLowerCase() === nodeId.toLowerCase() ||
          n.id.replace(/^file:[^:]+:/, '').toLowerCase() === nodeId.toLowerCase() ||
          (n.type === 'DEPENDENCY' && n.id.toLowerCase() === `dependency:${(n.metadata?.ecosystem as string || 'npm').toLowerCase()}:${nodeId.replace(/^dependency:/i, '').toLowerCase()}`)
      );

      const connectedEdges = graph
        ? graph.edges.filter((e) => e.source === nodeId || e.target === nodeId || (graphNode && (e.source === graphNode.id || e.target === graphNode.id)))
        : [];

      const connectedNodeIds = new Set<string>();
      connectedEdges.forEach((e) => {
        if (e.source !== nodeId && graphNode && e.source !== graphNode.id) connectedNodeIds.add(e.source);
        if (e.target !== nodeId && graphNode && e.target !== graphNode.id) connectedNodeIds.add(e.target);
      });

      const connectedNodes = graph
        ? graph.nodes.filter((n) => connectedNodeIds.has(n.id))
        : [];

      console.log(`→ Graph Context: ${connectedNodes.length} connected nodes, ${connectedEdges.length} edges`);

      // 3. Gather Context & Evidence Records
      let serializedContext = '';
      const canonicalRepoId = graph?.repositoryId || repositoryId;
      let validationContext: AIContext = buildEmptyValidationContext(canonicalRepoId, nodeId, lastUserQuestion);

      // Attempt bounded single + multi-file source context retrieval
      const rawPathCandidate = nodeMetadata?.filePath ||
        (graphNode?.metadata?.filePath as string) ||
        (graphNode?.metadata?.path as string) ||
        (graphNode?.type === 'FILE' ? graphNode.id : (nodeId.includes('/') || nodeId.includes('.') ? nodeId : null));

      const cleanFilePath = cleanNodeFilePath(rawPathCandidate);
      const snapshot = RepositoryController.getSnapshot(repositoryId);
      const { owner, repo } = resolveOwnerAndRepo(repositoryId, snapshot);
      const branch = snapshot?.metadata.defaultBranch || 'main';

      let fileContent: string | undefined = undefined;
      let fileSize: number | undefined = undefined;
      let fileContentStatus = 'NOT_ATTEMPTED';
      let isMermaid = false;
      let multiFileCtx: MultiFileContextResult | null = null;

      if (cleanFilePath || (graph && (graphNode?.type === 'DEPENDENCY' || /\b(depend|package|manifest|lockfile|version)\b/i.test(lastUserQuestion)))) {
        if (cleanFilePath) {
          console.log(`→ File Retrieval Attempt: "${cleanFilePath}" (${owner}/${repo}, branch: ${branch})`);
        }

        multiFileCtx = await MultiFileContextService.retrieveBoundedContext({
          repositoryId,
          canonicalRepoId,
          owner,
          repo,
          branch,
          selectedFilePath: cleanFilePath,
          nodeId,
          analysisType: activeAnalysisType,
          question: lastUserQuestion,
          graph,
          snapshot
        });

        if (multiFileCtx.selectedFile) {
          fileContent = multiFileCtx.selectedFile.content;
          fileSize = multiFileCtx.selectedFile.sizeBytes;
          fileContentStatus = multiFileCtx.selectedFile.reason || 'RETRIEVED_SUCCESSFULLY';
          isMermaid = Boolean(
            cleanFilePath?.toLowerCase().endsWith('.mermaid') ||
            (fileContent && (fileContent.includes('graph ') || fileContent.includes('sequenceDiagram') || fileContent.includes('flowchart')))
          );
          console.log(`→ File Retrieval Succeeded: ${fileSize} bytes (Mermaid: ${isMermaid})`);
        } else if (cleanFilePath) {
          const failure = multiFileCtx.unavailableFiles.find((u) => u.filePath === cleanFilePath);
          fileContentStatus = failure?.reason || 'UNAVAILABLE';
          console.log(`→ File Retrieval Status: ${fileContentStatus}`);
        }

        if (multiFileCtx.relatedFiles.length > 0 || multiFileCtx.omittedFiles.length > 0 || multiFileCtx.unavailableFiles.length > 0) {
          console.log(
            `→ Multi-File Context: ${multiFileCtx.relatedFiles.length} related file(s) retrieved (${multiFileCtx.stats.totalSourceBytes} total bytes), ` +
            `${multiFileCtx.unavailableFiles.length} unavailable, ${multiFileCtx.omittedFiles.length} omitted by cap`
          );
        }
      }

      const relevantDependencies = (snapshot?.dependencies || [])
        .filter((d) =>
          !cleanFilePath ||
          d.sourceFile === cleanFilePath ||
          nodeId === `dependency:${d.ecosystem}:${d.name}` ||
          nodeId === `dependency:${d.name}` ||
          /\b(depend|package|manifest|lockfile|version)\b/i.test(lastUserQuestion)
        )
        .slice(0, 25)
        .map((d) => ({
          name: d.name,
          declaredVersion: d.declaredVersion || d.version,
          resolvedVersion: d.resolvedVersion,
          category: d.category || 'dependencies',
          ecosystem: d.ecosystem,
          sourceFile: d.sourceFile,
          workspaceName: d.workspaceName
        }));

      let whyResult: any = null;
      let impactResult: ImpactResult | null = null;

      try {
        if (activeAnalysisType === 'WHY') {
          whyResult = WhyExplorerService.executeQuery({ repositoryId, nodeId });
          const context = EvidenceContextBuilder.buildContext(whyResult);
          const serialized = EvidenceContextBuilder.serializeContext(context);
          validationContext = buildWhyValidationContext(context, whyResult.target.id, canonicalRepoId);
          if (multiFileCtx?.sourceEvidenceRecords.length) {
            validationContext = {
              ...validationContext,
              evidence: [...validationContext.evidence, ...multiFileCtx.sourceEvidenceRecords]
            };
          }

          console.log(`→ History Context: ${whyResult?.historicalChain?.length || 0} steps in historical chain`);
          console.log(`→ Evidence Context: ${context.evidence.length} evidence records (+${multiFileCtx?.sourceEvidenceRecords.length || 0} source/AST records)`);

          const richContextObj = {
            repositoryId,
            selectedNode: {
              id: graphNode?.id || nodeId,
              label: graphNode?.label || nodeMetadata?.name || nodeId,
              type: graphNode?.type || nodeMetadata?.type || 'FILE',
              filePath: cleanFilePath || rawPathCandidate || nodeMetadata?.filePath || graphNode?.id,
              fileContent: fileContent,
              fileSize: fileSize,
              fileContentStatus: fileContentStatus,
              isMermaidDiagram: isMermaid,
              commitSha: nodeMetadata?.commitSha || graphNode?.metadata?.hash,
              branch: nodeMetadata?.branch || graphNode?.metadata?.branch,
              commitMessage: nodeMetadata?.commitMessage || graphNode?.metadata?.description,
              author: nodeMetadata?.author || graphNode?.metadata?.author,
              timestamp: nodeMetadata?.timestamp || graphNode?.createdAt
            },
            relatedSourceFiles: (multiFileCtx?.relatedFiles || []).map((f) => ({
              evidenceId: f.id,
              filePath: f.filePath,
              relationship: f.relationship,
              reason: f.reason,
              status: f.status,
              lineRange: f.lineRange,
              symbolsSummary: f.symbolsSummary,
              content: f.content
            })),
            unavailableSourceFiles: multiFileCtx?.unavailableFiles || [],
            omittedSourceFiles: multiFileCtx?.omittedFiles || [],
            sourceRetrievalStats: multiFileCtx?.stats || null,
            astStructure: multiFileCtx?.astHighlights || null,
            dependencyContext: relevantDependencies,
            sourceEvidenceRecords: (multiFileCtx?.sourceEvidenceRecords || []).map((ev) => ({
              id: ev.id,
              title: ev.title,
              relationshipType: ev.relationshipType,
              classification: ev.classification,
              description: ev.description,
              sourceUrl: ev.sourceUrl,
              timestamp: ev.timestamp
            })),
            groundingDirectives: {
              criticalRelationshipRule: "If relationshipType is CHANGED, state that a CHANGED relationship is recorded. DO NOT claim imports, dependencies, or function calls unless supported by IMPORTS/CALLS/DEPENDS_ON edges, astStructure, or retrieved source code.",
              forbiddenApiInvention: "DO NOT claim files use specific APIs/functions unless explicitly supported by context evidence, astStructure, or retrieved source content.",
              factVsInferenceVsUnknown: "State confirmed facts based on context and cite exact evidence IDs. Clearly label inferences as '**Inference:** ...'. If evidence is missing, state 'The available repository evidence does not establish this.'"
            },
            connectedNodes: connectedNodes.map((n) => ({ id: n.id, label: n.label, type: n.type })),
            connectedEdges: connectedEdges.map((e) => ({
              source: e.source,
              target: e.target,
              relationshipType: e.relationshipType,
              classification: e.classification,
              evidence: e.evidence,
              sourceUrl: e.sourceUrl
            })),
            whyEvidenceContext: serialized
          };
          serializedContext = JSON.stringify(richContextObj, null, 2);
        } else {
          impactResult = ImpactAnalysisService.analyzeImpact({
            repositoryId,
            nodeId,
            operation: 'REMOVE',
            maxDepth: 3
          });
          validationContext = buildWhatIfValidationContext(impactResult, canonicalRepoId, lastUserQuestion);
          if (multiFileCtx?.sourceEvidenceRecords.length) {
            validationContext = {
              ...validationContext,
              evidence: [...validationContext.evidence, ...multiFileCtx.sourceEvidenceRecords]
            };
          }

          console.log(`→ Impact Context: score ${impactResult.impactScore}, level ${impactResult.impactLevel}, ${impactResult.directImpact.length} direct dependents`);

          const contextObj = {
            repositoryId,
            target: {
              id: impactResult.target.id,
              type: impactResult.target.type,
              label: impactResult.target.label
            },
            nodeMetadata: {
              filePath: cleanFilePath || nodeMetadata?.filePath,
              fileContent: fileContent,
              fileSize: fileSize,
              fileContentStatus: fileContentStatus,
              isMermaidDiagram: isMermaid,
              commitSha: nodeMetadata?.commitSha,
              author: nodeMetadata?.author,
              timestamp: nodeMetadata?.timestamp
            },
            relatedSourceFiles: (multiFileCtx?.relatedFiles || []).map((f) => ({
              evidenceId: f.id,
              filePath: f.filePath,
              relationship: f.relationship,
              reason: f.reason,
              status: f.status,
              lineRange: f.lineRange,
              symbolsSummary: f.symbolsSummary,
              content: f.content
            })),
            unavailableSourceFiles: multiFileCtx?.unavailableFiles || [],
            omittedSourceFiles: multiFileCtx?.omittedFiles || [],
            sourceRetrievalStats: multiFileCtx?.stats || null,
            astStructure: multiFileCtx?.astHighlights || null,
            dependencyContext: relevantDependencies,
            sourceEvidenceRecords: (multiFileCtx?.sourceEvidenceRecords || []).map((ev) => ({
              id: ev.id,
              title: ev.title,
              relationshipType: ev.relationshipType,
              classification: ev.classification,
              description: ev.description,
              sourceUrl: ev.sourceUrl,
              timestamp: ev.timestamp
            })),
            groundingDirectives: {
              criticalRelationshipRule: "Rely strictly on deterministic WHAT-IF impact results, AST call/import relationships, and retrieved source files. IF directImpact and indirectImpact are empty, state clearly that no downstream components, APIs, or tests are affected.",
              forbiddenApiInvention: "DO NOT invent affected downstream components or unevidenced API breakages."
            },
            operation: impactResult.operation,
            impactLevel: impactResult.impactLevel,
            impactScore: impactResult.impactScore,
            directImpact: impactResult.directImpact.map((n: { id: string; type: string; label: string }) => ({ id: n.id, type: n.type, label: n.label })),
            indirectImpact: impactResult.indirectImpact.map((n: { id: string; type: string; label: string }) => ({ id: n.id, type: n.type, label: n.label })),
            affectedTests: impactResult.affectedTests.map((n: { id: string; type: string; label: string }) => ({ id: n.id, type: n.type, label: n.label })),
            affectedAPIs: impactResult.affectedAPIs.map((n: { id: string; type: string; label: string }) => ({ id: n.id, type: n.type, label: n.label })),
            affectedDependencies: impactResult.affectedDependencies.map((n: { id: string; type: string; label: string }) => ({ id: n.id, type: n.type, label: n.label })),
            connectedEdges: connectedEdges.map((e) => ({
              source: e.source,
              target: e.target,
              relationshipType: e.relationshipType,
              classification: e.classification,
              evidence: e.evidence,
              sourceUrl: e.sourceUrl
            })),
            evidenceRecords: validationContext.evidence.map((ev) => ({
              id: ev.id,
              title: ev.title,
              relationshipType: ev.relationshipType,
              classification: ev.classification,
              description: ev.description,
              sourceUrl: ev.sourceUrl,
              timestamp: ev.timestamp
            }))
          };
          serializedContext = JSON.stringify(contextObj, null, 2);
        }
      } catch (ctxErr) {
        console.warn('[ChatController] Context build warning, using basic node context:', ctxErr);
        validationContext = buildEmptyValidationContext(canonicalRepoId, nodeId, lastUserQuestion);
        if (multiFileCtx?.sourceEvidenceRecords.length) {
          validationContext = {
            ...validationContext,
            evidence: multiFileCtx.sourceEvidenceRecords
          };
        }
        serializedContext = JSON.stringify({
          repositoryId,
          nodeId,
          nodeMetadata: nodeMetadata || {},
          selectedNode: {
            id: nodeId,
            filePath: cleanFilePath || nodeId,
            fileContent: fileContent,
            fileContentStatus: fileContentStatus,
            isMermaidDiagram: isMermaid
          },
          relatedSourceFiles: (multiFileCtx?.relatedFiles || []).map((f) => ({
            evidenceId: f.id,
            filePath: f.filePath,
            relationship: f.relationship,
            reason: f.reason,
            status: f.status,
            lineRange: f.lineRange,
            content: f.content
          })),
          unavailableSourceFiles: multiFileCtx?.unavailableFiles || [],
          sourceEvidenceRecords: multiFileCtx?.sourceEvidenceRecords || [],
          astStructure: multiFileCtx?.astHighlights || null,
          dependencyContext: relevantDependencies,
          connectedNodes: connectedNodes.map((n) => ({ id: n.id, label: n.label, type: n.type }))
        });
      }

      // 4. Query Gemini AI Service
      console.log(`→ Gemini Call Started`);
      const rawResponse = await ProviderService.queryGeminiChat(
        serializedContext,
        messages,
        activeAnalysisType,
        nodeId
      );

      let effectiveResponse = rawResponse;
      const hasValidAnswer =
        effectiveResponse &&
        typeof effectiveResponse === 'object' &&
        !Array.isArray(effectiveResponse) &&
        typeof effectiveResponse.answer === 'string' &&
        effectiveResponse.answer.trim().length > 0;

      if (!hasValidAnswer) {
        console.warn('[ChatController] Malformed or incomplete provider response; invoking grounded local fallback.');
        effectiveResponse = ProviderService.generateLocalFallbackResponse(
          serializedContext,
          messages,
          activeAnalysisType,
          nodeId,
          'Malformed AI Response'
        );
      }

      if (
        effectiveResponse &&
        typeof effectiveResponse === 'object' &&
        typeof effectiveResponse.answer === 'string' &&
        effectiveResponse.answer.trim().length > 0
      ) {
        // 5. Validate structured claims and evidence IDs against request-specific AIContext
        const validation = StructuredOutputValidator.validate(effectiveResponse, validationContext);
        if (validation.validationLog.length > 0) {
          console.log(`[ChatController] Validator Interventions (${validation.validationLog.length}):`);
          validation.validationLog.forEach((entry) => console.log(`  - ${entry}`));
        }

        const claims = validation.claims.map((claim) => ({
          text: claim.text,
          classification: claim.classification,
          evidenceIds: claim.evidenceIds,
          ...(claim.reasoning ? { reasoning: claim.reasoning } : {}),
          ...(claim.sourceUrls && claim.sourceUrls.length > 0 ? { sourceUrls: claim.sourceUrls } : {})
        }));

        const suggestedFollowUps = Array.isArray(effectiveResponse.suggestedFollowUps)
          ? effectiveResponse.suggestedFollowUps
            .filter((q: unknown): q is string => typeof q === 'string' && q.trim().length > 0)
            .map((q: string) => q.trim())
          : [];

        const answerSanitized = effectiveResponse.answer.replace(/\\n/g, '\n');

        console.log(`→ Gemini Response Validated (answer length: ${answerSanitized.length} chars, claims: ${claims.length})`);
        console.log(`→ Response Passed to Frontend [VALIDATED AI RESPONSE]`);
        console.log(`========================================================\n`);

        res.json({
          answer: answerSanitized,
          claims,
          suggestedFollowUps,
          provider: effectiveResponse.provider || 'GEMINI',
          model: effectiveResponse.model || process.env.GEMINI_MODEL || 'gemini-3.6-flash',
          isFallback: Boolean(effectiveResponse.isFallback || effectiveResponse.provider === 'LOCAL_FALLBACK'),
          error: effectiveResponse.error
        });
        return;
      }

      res.status(500).json({ error: 'Failed to retrieve response from Gemini AI Service.' });
    } catch (err: any) {
      console.error('[ChatController] Chat handler failure:', err);
      const safeDetails = redactSecrets(err?.message || String(err));
      res.status(500).json({ error: 'Internal server error in Chat Controller.', details: safeDetails });
    }
  }

}
