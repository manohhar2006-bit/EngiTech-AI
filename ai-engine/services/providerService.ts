import { getChatSystemPrompt } from '../prompts/chatPrompts';

export type GeminiHealthStatus =
  | 'GEMINI_AVAILABLE'
  | 'GEMINI_NOT_CONFIGURED'
  | 'GEMINI_QUOTA_EXCEEDED'
  | 'GEMINI_RATE_LIMITED'
  | 'GEMINI_MODEL_UNAVAILABLE'
  | 'GEMINI_AUTH_ERROR'
  | 'GEMINI_NETWORK_ERROR'
  | 'UNKNOWN_GEMINI_ERROR';

export class ProviderService {
  /**
   * Fetch Gemini API key from environment variable (supporting GEMINI_API_KEY and GOOGLE_API_KEY)
   */
  private static getApiKey(): string | null {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key || key.trim() === '' || key.includes('your_gemini') || key.includes('your_google')) return null;
    return key.trim();
  }

  /**
   * Diagnostic startup logging for Gemini configuration and health
   */
  static async logConfigAndHealth(): Promise<void> {
    const apiKey = this.getApiKey();
    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const configured = Boolean(apiKey);

    console.log('\n========================================================');
    console.log('[Gemini Config]');
    console.log(`API Key Configured: ${configured ? 'YES' : 'NO'}`);
    console.log(`Model: ${model}`);
    console.log(`SDK / Protocol: Google REST v1 generateContent`);

    if (!configured) {
      console.log('[Gemini Health] Status: GEMINI_NOT_CONFIGURED (Set GEMINI_API_KEY in backend/.env)');
      console.log('========================================================\n');
      return;
    }

    const healthStatus = await this.checkHealth();
    console.log(`[Gemini Health] Status: ${healthStatus}`);
    if (healthStatus === 'GEMINI_QUOTA_EXCEEDED') {
      console.log('→ Note: Google AI Studio project quota is currently exhausted.');
    } else if (healthStatus === 'GEMINI_AVAILABLE') {
      console.log('→ Live Gemini AI reasoning engine is ready.');
    }
    console.log('========================================================\n');
  }

  /**
   * Lightweight health check using minimal payload ("Reply with OK.")
   * Uses native Gemini REST endpoint with standard x-goog-api-key header (no Bearer authorization).
   */
  static async checkHealth(): Promise<GeminiHealthStatus> {
    const apiKey = this.getApiKey();
    if (!apiKey) return 'GEMINI_NOT_CONFIGURED';

    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }],
          generationConfig: { maxOutputTokens: 10 }
        })
      });

      if (response.ok) return 'GEMINI_AVAILABLE';

      const errText = (await response.text()).toLowerCase();
      if (response.status === 429) {
        if (errText.includes('quota') || errText.includes('resource_exhausted')) {
          return 'GEMINI_QUOTA_EXCEEDED';
        }
        return 'GEMINI_RATE_LIMITED';
      }
      if (response.status === 404) return 'GEMINI_MODEL_UNAVAILABLE';
      if (response.status === 401 || response.status === 403) return 'GEMINI_AUTH_ERROR';
      return 'UNKNOWN_GEMINI_ERROR';
    } catch {
      return 'GEMINI_NETWORK_ERROR';
    }
  }

  /**
   * Single-question query wrapper for Phase 4 evidence reasoning
   */
  static async queryGemini(serializedContext: string, question: string): Promise<any | null> {
    return ProviderService.queryGeminiChat(serializedContext, [{ role: 'user', content: question }], 'WHY', 'target');
  }

  /**
   * Main Gemini integration method for conversational queries.
   * Directly queries the Google Gemini API with grounded context and conversation history.
   */
  static async queryGeminiChat(
    contextJson: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    analysisType: string,
    nodeId: string
  ): Promise<any> {
    const apiKey = ProviderService.getApiKey();
    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

    if (!apiKey) {
      console.warn('[ProviderService] Neither GEMINI_API_KEY nor GOOGLE_API_KEY is configured.');
      const targetLabel = nodeId.split('/').pop() || nodeId;
      return {
        answer: `⚠️ **Gemini Provider Configuration Required**: Neither \`GEMINI_API_KEY\` nor \`GOOGLE_API_KEY\` is configured in \`backend/.env\`. Please provide a valid Gemini API key to enable live AI reasoning.\n\nEngiTrace can still provide deterministic graph analysis and evidence tracking for **${targetLabel}**.`,
        claims: [],
        suggestedFollowUps: [
          `Why does ${targetLabel} exist?`,
          `Which commit changed ${targetLabel}?`,
          `What depends on ${targetLabel}?`,
          `What happens if I remove ${targetLabel}?`
        ],
        provider: 'PROVIDER_CONFIGURATION_REQUIRED',
        model: model,
        error: 'PROVIDER_CONFIGURATION_REQUIRED'
      };
    }

    const lastMsg = messages[messages.length - 1]?.content || '';
    const qLower = lastMsg.toLowerCase().trim();

    // Intent-specific prompt directives
    let intentInstructions = '';
    if (qLower.includes('simple') || qLower.includes('simpler') || qLower.includes('easy') || qLower.includes('explain simply')) {
      intentInstructions = `\n- The user requested a simple explanation. Translate technical architectural concepts into clear, intuitive prose without inventing unevidenced facts.`;
    } else if (qLower.includes('commit') || qLower.includes('who') || qLower.includes('author') || qLower.includes('when') || qLower.includes('date') || qLower.includes('introduce')) {
      intentInstructions = `\n- The user is asking about commit history or authorship. Directly report the real commit SHA, author name, timestamp, and commit message from the context. If no commit records are present in context, state: "The available repository evidence does not contain commit records for this file." Never invent commit details.`;
    } else if (qLower.includes('depend') || qLower.includes('connect') || qLower.includes('relation') || qLower.includes('use') || qLower.includes('flow')) {
      intentInstructions = `\n- The user is asking about component relationships or dependencies.
- CANONICAL DIRECTION RULE: Format graph relationships explicitly as: SourceNode ├── [RELATIONSHIP_TYPE] ──→ TargetNode (e.g. repository:repo-name ├── [CONTAINS] ──→ file:path/to/file.js). NEVER reverse relationship direction.
- DO NOT transform CONTAINS into DEPENDS_ON. Containment does NOT imply dependency.
- DO NOT transform TOUCHES into IMPORTS.
- Wrap relationship flows in a \`\`\`graph ... \`\`\` block when helpful.
- If the user asks what depends on a file and no downstream DEPENDS_ON relationship exists in context, state clearly: "The current graph does not record any downstream dependency relationship for this file."`;
    } else if (qLower.includes('remove') || qLower.includes('delete') || qLower.includes('impact') || qLower.includes('happen') || qLower.includes('break')) {
      intentInstructions = `\n- The user asks about removal impact. Ground your answer strictly in the deterministic WHAT-IF impact results (impact level, score, direct/indirect affected nodes, APIs, tests).
- IF directImpact and indirectImpact are empty (score 0), state clearly: "EngiTrace detects no downstream graph dependencies for this node, so the deterministic graph impact score is 0 (LOW). The current graph models in-repository structural dependencies. External build, CI, tooling, deployment, or organizational dependencies outside the modeled graph cannot be determined from this analysis alone."
- DO NOT say "completely safe" unless evidence explicitly proves zero overall risk. DO NOT invent affected downstream components or unevidenced API breakages.`;
    } else if (qLower.includes('explain') || qLower.includes('why') || qLower.includes('purpose') || qLower.includes('overview') || qLower.includes('describe') || qLower.includes('diagram') || qLower.includes('component')) {
      intentInstructions = `\n- The user asks for an explanation of the entity or file/diagram contents.
- Always provide natural, readable prose answering the user's question directly.
- If selectedNode.fileContent is available (e.g. a Mermaid diagram or source code), inspect the actual file content and explain its defined components, nodes, links, and overall structure.
- State its repository location, node type, commit history, and recorded graph relationships. Do NOT start your response with robotic database headers. Do NOT invent API usage or original author motivations unless supported by evidence.
- If selectedNode.fileContent is unavailable or failed, state clearly that file contents could not be accessed and explain only what metadata and graph edges genuinely support.`;
    }

    const { prompt: systemPrompt, version: promptVersion } = getChatSystemPrompt({
      nodeId,
      analysisType,
      intentInstructions
    });

    const conversationText = messages.map((m) => `${m.role === 'user' ? 'User' : 'EngiTrace AI'}: ${m.content}`).join('\n\n');
    const userPromptText = `Repository Node Context:
${contextJson}

Conversation History:
${conversationText}

Respond to the last User query in the required JSON format.`;

    console.log(`[ProviderService] GEMINI_CALL_STARTED -> node: "${nodeId}", model: "${model}", analysisType: "${analysisType}", prompt: "${promptVersion}"`);
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: systemPrompt },
            { text: userPromptText }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    };

    let attempt = 0;
    const maxAttempts = 3;
    const timeoutMs = 30000;

    while (attempt < maxAttempts) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text();
          const errLower = errText.toLowerCase();

          // Unrecoverable Auth Error (401 / 403 Invalid Key)
          if (response.status === 401 || (response.status === 403 && (errLower.includes('api_key') || errLower.includes('unauthenticated')))) {
            console.warn(`[ProviderService] Gemini API returned HTTP ${response.status} AUTH_ERROR. Halting retries.`);
            return {
              answer: `⚠️ **Gemini Authentication Failed**: Invalid API key provided in \`backend/.env\` (HTTP ${response.status}). Please verify your Google AI Studio API key.`,
              claims: [],
              suggestedFollowUps: [],
              provider: 'PROVIDER_CONFIGURATION_REQUIRED',
              model: model,
              error: 'PROVIDER_CONFIGURATION_REQUIRED'
            };
          }

          // Quota Exhaustion (429 with Quota / Resource Exhausted)
          if (response.status === 429 && (errLower.includes('quota') || errLower.includes('resource_exhausted'))) {
            console.warn(`[ProviderService] Gemini API returned HTTP 429 QUOTA_EXCEEDED (Model: ${model}). Halting retries.`);
            return ProviderService.generateLocalFallbackResponse(contextJson, messages, analysisType, nodeId, 'HTTP 429 Quota Exceeded');
          }

          // Unrecoverable Model Not Found Error (404)
          if (response.status === 404) {
            console.warn(`[ProviderService] Gemini API returned HTTP 404 GEMINI_MODEL_UNAVAILABLE for model "${model}".`);
            return {
              answer: `⚠️ **Gemini Model Unavailable**: The configured Gemini model \`${model}\` was not found (HTTP 404). Please verify \`GEMINI_MODEL\` in \`backend/.env\`.`,
              claims: [],
              suggestedFollowUps: [],
              provider: 'GEMINI_ERROR',
              model: model,
              error: 'GEMINI_MODEL_UNAVAILABLE'
            };
          }

          // Transient Retryable Errors: 503, 429 (rate limit), 408, 500, 502, 504
          const isRetryable = response.status === 503 || response.status === 429 || response.status === 408 || (response.status >= 500 && response.status <= 599);

          if (isRetryable && attempt < maxAttempts) {
            const retryAfterHeader = response.headers.get('retry-after');
            let backoffMs = Math.min(3000, Math.floor(600 * Math.pow(2, attempt - 1) + Math.random() * 200));
            if (retryAfterHeader) {
              const parsedSec = parseInt(retryAfterHeader, 10);
              if (!isNaN(parsedSec) && parsedSec > 0) {
                backoffMs = Math.min(3000, parsedSec * 1000);
              }
            }
            console.warn(`[ProviderService] Gemini API returned HTTP ${response.status} (attempt ${attempt}/${maxAttempts}). Retrying in ${backoffMs}ms...`);
            await new Promise((r) => setTimeout(r, backoffMs));
            continue;
          }

          console.warn(`[ProviderService] Gemini API returned HTTP status ${response.status} for model "${model}" after ${attempt} attempts.`);
          return ProviderService.generateLocalFallbackResponse(contextJson, messages, analysisType, nodeId, `HTTP ${response.status}`);
        }

        const data = await response.json();
        const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textOutput || typeof textOutput !== 'string' || !textOutput.trim()) {
          console.warn(`[ProviderService] Empty output received from Gemini model "${model}".`);
          return ProviderService.generateLocalFallbackResponse(contextJson, messages, analysisType, nodeId, 'Empty Gemini Response');
        }

        console.log(`[ProviderService] GEMINI_CALL_SUCCESS -> model: "${model}", length: ${textOutput.length} chars`);

        const normalized = ProviderService.parseAndNormalizeChatResponse(textOutput, nodeId, model);
        if (normalized) {
          console.log(`[ProviderService] GEMINI_RESPONSE_PASSED -> answer length: ${normalized.answer.length} chars`);
          return normalized;
        }

        console.warn(`[ProviderService] Malformed or incomplete structured output received from Gemini model "${model}". Using local fallback.`);
        return ProviderService.generateLocalFallbackResponse(contextJson, messages, analysisType, nodeId, 'Malformed Gemini Response');
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.warn(`[ProviderService] Gemini API call timed out after ${timeoutMs}ms for node "${nodeId}". Halting retries.`);
          return ProviderService.generateLocalFallbackResponse(contextJson, messages, analysisType, nodeId, 'Request Timeout');
        }
        if (attempt < maxAttempts) {
          const backoffMs = Math.min(3000, Math.floor(600 * Math.pow(2, attempt - 1) + Math.random() * 200));
          console.warn(`[ProviderService] Network error querying Gemini API (attempt ${attempt}/${maxAttempts}): ${err?.message}. Retrying in ${backoffMs}ms...`);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        console.warn(`[ProviderService] Network error querying Gemini API model "${model}" after ${maxAttempts} attempts:`, err?.message || String(err));
        return ProviderService.generateLocalFallbackResponse(contextJson, messages, analysisType, nodeId, 'Network Failure');
      }
    }

    return ProviderService.generateLocalFallbackResponse(contextJson, messages, analysisType, nodeId, 'Service Unavailable');
  }

  /**
   * Parse and safely normalize raw Gemini chat text output into the structured chat response contract.
   * Returns null when the response is empty, corrupt JSON, or lacks a valid answer/summary.
   */
  static parseAndNormalizeChatResponse(
    textOutput: unknown,
    nodeId: string,
    model: string = process.env.GEMINI_MODEL || 'gemini-3.6-flash'
  ): {
    answer: string;
    claims: any[];
    suggestedFollowUps: string[];
    provider: string;
    model: string;
    isFallback: boolean;
  } | null {
    if (typeof textOutput !== 'string') return null;
    const trimmed = textOutput.trim();
    if (!trimmed) return null;

    const tryParse = (candidate: string): { ok: true; value: unknown } | { ok: false } => {
      try {
        return { ok: true, value: JSON.parse(candidate) };
      } catch {
        return { ok: false };
      }
    };

    let parsed: any = null;
    let parsedFromJson = false;

    const directParse = tryParse(trimmed);
    if (directParse.ok) {
      parsed = directParse.value;
      parsedFromJson = true;
    } else {
      const jsonFenceMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
      if (jsonFenceMatch) {
        const fencedParse = tryParse(jsonFenceMatch[1].trim());
        if (fencedParse.ok) {
          parsed = fencedParse.value;
          parsedFromJson = true;
        }
      }

      if (!parsedFromJson) {
        const genericFenceMatch = trimmed.match(/```\s*([\s\S]*?)\s*```/i);
        const inner = genericFenceMatch?.[1]?.trim() || '';
        if (inner.startsWith('{') && inner.endsWith('}')) {
          const fencedObjParse = tryParse(inner);
          if (fencedObjParse.ok) {
            parsed = fencedObjParse.value;
            parsedFromJson = true;
          }
        }
      }
    }

    if (!parsedFromJson) {
      // Reject truncated/corrupt JSON rather than displaying raw JSON fragments to the user
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return null;
      }

      console.log('[ProviderService] Raw text returned by Gemini (non-JSON format). Wrapping as natural answer response.');
      parsed = {
        answer: trimmed,
        claims: [],
        suggestedFollowUps: [
          `Which commit changed ${nodeId}?`,
          `What depends on ${nodeId}?`
        ]
      };
    }

    if (typeof parsed === 'string') {
      const cleanStr = parsed.trim();
      if (!cleanStr) return null;
      return {
        answer: cleanStr.replace(/\\n/g, '\n'),
        claims: [],
        suggestedFollowUps: [],
        provider: 'GEMINI',
        model,
        isFallback: false
      };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const rawAnswer =
      typeof parsed.answer === 'string' && parsed.answer.trim()
        ? parsed.answer
        : typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary
          : '';

    if (!rawAnswer.trim()) {
      return null;
    }

    const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
    const suggestedFollowUps = Array.isArray(parsed.suggestedFollowUps)
      ? parsed.suggestedFollowUps
        .filter((q: unknown): q is string => typeof q === 'string' && q.trim().length > 0)
        .map((q: string) => q.trim())
      : [];

    return {
      answer: rawAnswer.replace(/\\n/g, '\n'),
      claims,
      suggestedFollowUps,
      provider: 'GEMINI',
      model,
      isFallback: false
    };
  }

  /**
   * Deterministic, evidence-grounded local fallback generator when Gemini API is unavailable or overloaded
   */
  static generateLocalFallbackResponse(
    contextJson: string,
    _messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    analysisType: string,
    nodeId: string,
    errorReason: string
  ): any {
    let ctx: any = {};
    try {
      ctx = JSON.parse(contextJson);
    } catch { }

    const targetLabel = ctx.selectedNode?.label || ctx.target?.label || nodeId.split('/').pop() || nodeId;
    const rawPath = ctx.selectedNode?.filePath || ctx.nodeMetadata?.filePath || nodeId;
    const filePath = typeof rawPath === 'string' ? rawPath.replace(/^file:[^:]+:/, '').replace(/^file:/, '') : nodeId;
    const fileContent = ctx.selectedNode?.fileContent || ctx.nodeMetadata?.fileContent;
    const isMermaid = Boolean(
      ctx.selectedNode?.isMermaidDiagram ||
      ctx.nodeMetadata?.isMermaidDiagram ||
      filePath.toLowerCase().endsWith('.mermaid') ||
      (fileContent && (fileContent.includes('graph ') || fileContent.includes('sequenceDiagram') || fileContent.includes('flowchart')))
    );

    let prose = `> ℹ️ **Notice**: Gemini AI service is temporarily unavailable (${errorReason}). EngiTrace provided this evidence-grounded fallback using deterministic graph analysis and retrieved file context.\n\n`;

    // 1. Natural Language Explanation based on file content & node context
    if (fileContent) {
      if (isMermaid) {
        prose += `\`${filePath}\` is an architecture diagram file in repository \`${ctx.repositoryId || 'current'}\` defining system components and relationships.\n\n`;

        // Parse mermaid lines
        const lines = fileContent.split('\n').filter((l: string) => l.trim() && !l.trim().startsWith('%%'));
        const diagramType = lines[0]?.trim() || 'Mermaid Diagram';
        prose += `**Diagram Format:** \`${diagramType}\` (${fileContent.length} bytes)\n\n`;

        // Extract nodes and links from Mermaid text
        const nodeLabels: string[] = [];
        const linkLines: string[] = [];

        lines.forEach((line: string) => {
          const trimmed = line.trim();
          if (trimmed.includes('-->') || trimmed.includes('---') || trimmed.includes('==>') || trimmed.includes('->')) {
            linkLines.push(trimmed);
          }
          const matches = trimmed.match(/([A-Za-z0-9_\-\.\/]+)\s*(\[.*?\]|\(.*?\)|".*?")/g);
          if (matches) {
            matches.forEach((m: string) => {
              const cleaned = m.replace(/^[A-Za-z0-9_\-\.\/]+\s*/, '').replace(/[\(\)\[\]"]/g, '').trim();
              if (cleaned && !nodeLabels.includes(cleaned)) {
                nodeLabels.push(cleaned);
              }
            });
          }
        });

        if (nodeLabels.length > 0) {
          prose += `**Depicted System Components:**\n`;
          nodeLabels.slice(0, 10).forEach((lbl) => {
            prose += `• **${lbl}**\n`;
          });
          prose += `\n`;
        }

        if (linkLines.length > 0) {
          prose += `**Component Connections & Flow:**\n`;
          linkLines.slice(0, 8).forEach((link) => {
            prose += `• \`${link}\`\n`;
          });
          prose += `\n`;
        }
      } else {
        prose += `\`${filePath}\` was retrieved from repository \`${ctx.repositoryId || 'current'}\` (${fileContent.length} bytes).\n\n`;

        const lines = fileContent.split('\n');
        const highlights = lines.filter((l: string) => l.trim().startsWith('#') || l.trim().startsWith('//') || l.trim().startsWith('import') || l.trim().startsWith('export') || l.trim().startsWith('class '));
        if (highlights.length > 0) {
          prose += `**File Structure Highlights:**\n`;
          highlights.slice(0, 8).forEach((h: string) => {
            prose += `• \`${h.trim().slice(0, 80)}\`\n`;
          });
          prose += `\n`;
        }
      }
    } else {
      const statusReason = ctx.selectedNode?.fileContentStatus || ctx.nodeMetadata?.fileContentStatus || 'unavailable';
      prose += `Node \`${targetLabel}\` is registered in repository \`${ctx.repositoryId || 'current'}\`.\n\n`;
      prose += `*Note: Direct source file content could not be accessed (${statusReason}). The explanation below is grounded in verified graph topology and commit history evidence.*\n\n`;
    }

    // 1a. Related multi-file source context & AST summary when available
    const relatedFiles = Array.isArray(ctx.relatedSourceFiles) ? ctx.relatedSourceFiles : [];
    if (relatedFiles.length > 0) {
      prose += `**Related Retrieved Source Context (${relatedFiles.length} file(s)):**\n`;
      relatedFiles.slice(0, 4).forEach((rf: any) => {
        prose += `• \`${rf.filePath}\` (${rf.relationship || 'RELATED'} — ${rf.reason || 'retrieved'})\n`;
      });
      prose += `\n`;
    }

    if (ctx.astStructure && Array.isArray(ctx.astStructure.selectedFileSymbols) && ctx.astStructure.selectedFileSymbols.length > 0) {
      prose += `**Parsed AST Symbols:**\n`;
      ctx.astStructure.selectedFileSymbols.slice(0, 8).forEach((sym: string) => {
        prose += `• \`${sym}\`\n`;
      });
      prose += `\n`;
    }

    // 1b. Deterministic What-If Impact section if present
    if (analysisType === 'WHAT_IF' || typeof ctx.impactScore === 'number') {
      const directCount = Array.isArray(ctx.directImpact) ? ctx.directImpact.length : 0;
      const indirectCount = Array.isArray(ctx.indirectImpact) ? ctx.indirectImpact.length : 0;
      const impactScore = typeof ctx.impactScore === 'number' ? ctx.impactScore : 0;
      const impactLevel = ctx.impactLevel || 'LOW';
      if (impactScore === 0 && directCount === 0 && indirectCount === 0) {
        prose += `**Deterministic Impact Assessment:** No downstream graph dependencies were detected for \`${targetLabel}\` (Impact Score: 0/100, Level: ${impactLevel}). External build, CI, tooling, or deployment dependencies outside the modeled graph cannot be determined from this analysis alone.\n\n`;
      } else {
        prose += `**Deterministic Impact Assessment:** Impact Level **${impactLevel}** (Score: ${impactScore}/100) across ${directCount} direct dependent(s) and ${indirectCount} indirect dependent(s).\n\n`;
      }
    }

    // 2. Commit & Authorship History
    const commitSha = ctx.selectedNode?.commitSha || ctx.nodeMetadata?.commitSha;
    const author = ctx.selectedNode?.author || ctx.nodeMetadata?.author;
    const commitMsg = ctx.selectedNode?.commitMessage;
    const timestamp = ctx.selectedNode?.timestamp || ctx.nodeMetadata?.timestamp;

    if (commitSha || author) {
      prose += `**Recent Commit Record:**\n`;
      if (commitSha) prose += `• **Commit:** \`${commitSha.substring(0, 8)}\`\n`;
      if (author) prose += `• **Author:** ${author}\n`;
      if (commitMsg) prose += `• **Message:** "${commitMsg}"\n`;
      if (timestamp) prose += `• **Date:** ${timestamp}\n`;
      prose += `\n`;
    } else {
      prose += `**Commit History:** No commit records exist for this node in the current graph snapshot.\n\n`;
    }

    // 3. Recorded Graph Relationships block
    const edges = ctx.connectedEdges || [];
    if (edges.length > 0) {
      prose += `**Recorded Graph Relationships:**\n`;
      prose += `\`\`\`graph\n`;
      edges.forEach((e: any) => {
        prose += `${e.source} ├── [${e.relationshipType || 'CONNECTED'}] ──→ ${e.target}\n`;
      });
      prose += `\`\`\`\n\n`;
    } else {
      prose += `*No direct graph relationships recorded for this node in the current graph context.*\n\n`;
    }

    // 4. Build evidence-backed structured claims from actual retrieved evidence records in context
    let whyRecords: any[] = [];
    if (typeof ctx.whyEvidenceContext === 'string') {
      try {
        const parsedWhy = JSON.parse(ctx.whyEvidenceContext);
        if (Array.isArray(parsedWhy?.evidenceRecords)) {
          whyRecords = parsedWhy.evidenceRecords;
        }
      } catch { }
    }
    const impactRecords: any[] = Array.isArray(ctx.evidenceRecords) ? ctx.evidenceRecords : [];
    const sourceRecords: any[] = Array.isArray(ctx.sourceEvidenceRecords) ? ctx.sourceEvidenceRecords : [];
    const availableRecords = [...whyRecords, ...impactRecords, ...sourceRecords].filter(
      (rec) => rec && typeof rec.id === 'string' && rec.id.trim().length > 0
    );

    const claims: Array<{
      text: string;
      classification: 'FACT' | 'INFERENCE' | 'UNKNOWN';
      evidenceIds: string[];
      reasoning?: string;
      sourceUrls?: string[];
    }> = [];

    const factRecord = availableRecords.find((r) => String(r.classification).toUpperCase() === 'FACT');
    if (factRecord) {
      claims.push({
        text: factRecord.description || factRecord.evidence || factRecord.title || `Node ${targetLabel} is linked in repository ${ctx.repositoryId || 'graph'}.`,
        classification: 'FACT',
        evidenceIds: [factRecord.id],
        ...(typeof factRecord.sourceUrl === 'string' && factRecord.sourceUrl ? { sourceUrls: [factRecord.sourceUrl] } : {})
      });
    }

    const inferenceRecord = availableRecords.find((r) => String(r.classification).toUpperCase() === 'INFERENCE');
    if (inferenceRecord) {
      claims.push({
        text: inferenceRecord.title || `Inferred connection for ${targetLabel} via ${inferenceRecord.relationshipType || 'graph relationship'}.`,
        classification: 'INFERENCE',
        evidenceIds: [inferenceRecord.id],
        reasoning: inferenceRecord.description || inferenceRecord.evidence || 'Derived from graph relationship evidence.'
      });
    }

    if (!fileContent) {
      claims.push({
        text: `Source content for ${filePath} was not accessed (${ctx.selectedNode?.fileContentStatus || ctx.nodeMetadata?.fileContentStatus || 'unavailable'}). Original author intent cannot be confirmed without source content.`,
        classification: 'UNKNOWN',
        evidenceIds: []
      });
    } else if (claims.length === 0) {
      claims.push({
        text: `Source content for ${filePath} was analyzed locally, but no graph evidence record IDs were attached to this fallback context.`,
        classification: 'UNKNOWN',
        evidenceIds: []
      });
    }

    const suggestedFollowUps = [
      `Why does ${targetLabel} exist?`,
      `What depends on ${targetLabel}?`,
      `Which commit changed ${targetLabel}?`,
      `What happens if ${targetLabel} is removed?`
    ];

    return {
      answer: prose,
      claims,
      suggestedFollowUps,
      provider: 'LOCAL_FALLBACK',
      model: 'engitrace-evidence-fallback',
      isFallback: true
    };
  }
}
