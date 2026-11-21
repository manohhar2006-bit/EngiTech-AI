import React from 'react';
import { GitCommit, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

interface GraphEdgeItem {
  source: string;
  relationship: string;
  target: string;
}

/**
 * Parses ASCII tree/relationship graph text into structured node-edge records
 */
function parseGraphRelationships(text: string): { edges: GraphEdgeItem[]; cleanProse: string } {
  const lines = text.split('\n');
  const edges: GraphEdgeItem[] = [];
  const nonGraphLines: string[] = [];

  let currentSourceNode = '';

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      nonGraphLines.push(line);
      return;
    }

    // Pattern 1: Inline Arrow notation (e.g. "source ├──RELATIONSHIP──→ target" or "source ├──→ target" or "source ──[REL]──→ target")
    const inlineArrowMatch = trimmed.match(/^([^\s├└─]+(?:\s+[^\s├└─]+)*)\s*(?:├──|└──|──)\s*(?:\[?([^\]─>]+)\]?)?\s*(?:──→|─→|->|→)\s*(.+)$/);
    if (inlineArrowMatch) {
      const source = inlineArrowMatch[1].trim();
      const relationship = (inlineArrowMatch[2] || 'CONNECTED').trim();
      const target = inlineArrowMatch[3].trim();
      if (source && target) {
        edges.push({ source, relationship, target });
        currentSourceNode = source;
        return;
      }
    }

    // Pattern 2: Tree branch indentation (e.g. "  ├── [CONTAINS] → target" or "  └── ⚡ (AFFECTED) target")
    const treeBranchMatch = trimmed.match(/^(?:├──|└──)\s*(?:\[([^\]]+)\]|⚡\s*\(([^\)]+)\)|([^\s→]+))?\s*(?:→|──→|->)?\s*(.+)$/);
    if (treeBranchMatch) {
      const relPart = treeBranchMatch[1] || treeBranchMatch[2] || treeBranchMatch[3] || 'CONNECTED';
      const target = treeBranchMatch[4].trim();
      if (target) {
        const source = currentSourceNode || 'Root Component';
        edges.push({ source, relationship: relPart.trim(), target });
        return;
      }
    }

    // Check if this line looks like a standalone parent node for a tree (e.g. "settings.json" or "[REMOVE] settings.json")
    if (
      !trimmed.includes('├──') &&
      !trimmed.includes('└──') &&
      !trimmed.includes('──→') &&
      (lines.some((nextL) => nextL.includes('├──') || nextL.includes('└──')))
    ) {
      currentSourceNode = trimmed.replace(/^#+\s*/, '').replace(/:\s*$/, '').trim();
      return;
    }

    nonGraphLines.push(line);
  });

  return { edges, cleanProse: nonGraphLines.join('\n').trim() };
}

/**
 * Shorten long file or repo URIs for clean card rendering
 */
function shortenNodeName(name: string): string {
  if (!name) return '';
  // Strip common repository prefixes for clean display
  let clean = name.replace(/^file:[^:]+:/, '').replace(/^repository:/, '').replace(/^\[REMOVE\]\s*/, '');
  if (clean.length > 36) {
    const parts = clean.split('/');
    if (parts.length > 2) {
      return `${parts[0]}/.../${parts[parts.length - 1]}`;
    }
  }
  return clean;
}

/**
 * Visual Graph Relationship Card Component
 */
const GraphVisualCard: React.FC<{ edges: GraphEdgeItem[] }> = ({ edges }) => {
  if (edges.length === 0) return null;

  return (
    <div className="my-3 rounded-xl bg-[#090D16] border border-cyan-900/40 p-3.5 shadow-lg space-y-2.5 font-sans">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
        <GitCommit className="w-3.5 h-3.5 text-cyan-400" />
        <span>RECORDED GRAPH RELATIONSHIPS ({edges.length})</span>
      </div>

      <div className="space-y-2">
        {edges.map((edge, idx) => {
          const isAffected = edge.relationship.includes('AFFECTED') || edge.relationship.includes('⚡');
          const isFact = edge.relationship === 'CONTAINS' || edge.relationship === 'AUTHORED_BY';
          
          return (
            <div
              key={idx}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 hover:border-cyan-800/50 transition-colors"
            >
              {/* Source Node */}
              <div className="flex items-center gap-2 max-w-[42%] overflow-hidden">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isAffected ? 'bg-amber-400' : 'bg-cyan-400'}`} />
                <span className="font-mono text-xs font-semibold text-slate-100 truncate" title={edge.source}>
                  {shortenNodeName(edge.source)}
                </span>
              </div>

              {/* Relationship Badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-950/70 border border-cyan-800/60 text-[10px] font-mono font-medium text-cyan-300 flex-shrink-0 shadow-sm">
                {isAffected ? <Zap className="w-3 h-3 text-amber-400" /> : <ShieldCheck className="w-3 h-3 text-cyan-400" />}
                <span className="tracking-wide uppercase">{edge.relationship}</span>
                <ArrowRight className="w-3 h-3 text-cyan-400" />
              </div>

              {/* Target Node */}
              <div className="flex items-center gap-2 max-w-[42%] overflow-hidden">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isAffected ? 'bg-rose-400' : 'bg-indigo-400'}`} />
                <span className="font-mono text-xs font-semibold text-slate-100 truncate" title={edge.target}>
                  {shortenNodeName(edge.target)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  if (!content) return null;

  // Sanitize literal '\n' escape strings from JSON serialization
  const sanitizedContent = content.replace(/\\n/g, '\n');

  // Split content into code blocks vs normal text
  const parts = sanitizedContent.split(/(```[\s\S]*?```)/g);

  return (
    <div className={`space-y-2 text-slate-200 text-xs font-sans leading-relaxed ${className}`}>
      {parts.map((part, pIdx) => {
        if (part.startsWith('```')) {
          // Code block or graph block
          const firstLineEnd = part.indexOf('\n');
          const langHeader = firstLineEnd !== -1 ? part.slice(3, firstLineEnd).trim().toLowerCase() : '';
          const codeText = firstLineEnd !== -1 
            ? part.slice(firstLineEnd + 1, -3).trim()
            : part.slice(3, -3).trim();

          // Check if this code block contains graph/tree relationships
          if (langHeader === 'graph' || codeText.includes('├──') || codeText.includes('└──') || codeText.includes('──→')) {
            const { edges, cleanProse } = parseGraphRelationships(codeText);
            if (edges.length > 0) {
              return (
                <React.Fragment key={pIdx}>
                  {cleanProse && <p className="py-0.5 text-slate-200">{parseInlineMarkdown(cleanProse)}</p>}
                  <GraphVisualCard edges={edges} />
                </React.Fragment>
              );
            }
          }

          // Fallback code block
          return (
            <div key={pIdx} className="my-2.5 rounded-xl bg-[#090D16] border border-cyan-900/40 p-3 overflow-x-auto font-mono text-[11px] text-cyan-300 leading-relaxed shadow-inner">
              <pre>{codeText}</pre>
            </div>
          );
        }

        // Check if raw text contains tree graph lines
        if (part.includes('├──') || part.includes('└──') || part.includes('──→')) {
          const { edges, cleanProse } = parseGraphRelationships(part);
          if (edges.length > 0) {
            return (
              <React.Fragment key={pIdx}>
                {cleanProse && renderTextLines(cleanProse)}
                <GraphVisualCard edges={edges} />
              </React.Fragment>
            );
          }
        }

        return <React.Fragment key={pIdx}>{renderTextLines(part)}</React.Fragment>;
      })}
    </div>
  );
};

/**
 * Render standard markdown prose lines
 */
function renderTextLines(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, lIdx) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={lIdx} className="h-1.5" />;

    // Header 3
    if (trimmed.startsWith('### ')) {
      return (
        <h3 key={lIdx} className="text-sm font-bold text-cyan-400 mt-3 mb-1 font-mono tracking-wide">
          {parseInlineMarkdown(trimmed.slice(4))}
        </h3>
      );
    }

    // Header 2 or 1
    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const headerText = trimmed.replace(/^#+\s*/, '');
      return (
        <h2 key={lIdx} className="text-base font-bold text-white mt-4 mb-1 font-display">
          {parseInlineMarkdown(headerText)}
        </h2>
      );
    }

    // Bullet points (• or - or *)
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletText = trimmed.slice(2);
      return (
        <div key={lIdx} className="flex items-start gap-2 pl-1 py-0.5 text-slate-300">
          <span className="text-cyan-400 font-bold flex-shrink-0 mt-0.5">•</span>
          <span>{parseInlineMarkdown(bulletText)}</span>
        </div>
      );
    }

    // Numbered lists (1. 2. etc)
    if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+\.)\s*(.*)$/);
      if (match) {
        return (
          <div key={lIdx} className="flex items-start gap-2 pl-1 py-0.5 text-slate-300">
            <span className="text-cyan-400 font-bold font-mono text-[11px] flex-shrink-0 mt-0.5">{match[1]}</span>
            <span>{parseInlineMarkdown(match[2])}</span>
          </div>
        );
      }
    }

    // Standard paragraph line
    return (
      <p key={lIdx} className="py-0.5 text-slate-200">
        {parseInlineMarkdown(line)}
      </p>
    );
  });
}

/**
 * Helper to parse inline bold (**text**), inline code (`code`), and italic (*text*)
 */
function parseInlineMarkdown(text: string): React.ReactNode {
  const tokens = text.split(/(\*\*[\s\S]*?\*\*|`[\s\S]*?`|\*[\s\S]*?\*)/g);

  return tokens.map((token, tIdx) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={tIdx} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={tIdx} className="bg-slate-900 border border-slate-800 text-cyan-300 font-mono text-[11px] px-1.5 py-0.5 rounded">
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && !token.startsWith('**')) {
      return (
        <em key={tIdx} className="italic text-slate-400">
          {token.slice(1, -1)}
        </em>
      );
    }
    return token;
  });
}
