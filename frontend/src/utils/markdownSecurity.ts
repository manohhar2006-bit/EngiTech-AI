import { sanitizeExternalUrl } from './urlSecurity';

export type InlineMarkdownToken =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'code'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'link'; content: string; href: string };

/**
 * Safely tokenizes inline markdown constructs while neutralizing unsafe link schemes
 * (javascript:, data:, vbscript:, file:, etc.) and keeping raw HTML tags as inert text.
 */
export function tokenizeInlineMarkdown(text: string): InlineMarkdownToken[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const pattern = /(\[[^\]\n]+\]\([^)\s\n]+\)|\*\*[\s\S]*?\*\*|`[\s\S]*?`|\*[\s\S]*?\*)/g;
  const parts = text.split(pattern);
  const tokens: InlineMarkdownToken[] = [];

  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith('[') && part.endsWith(')')) {
      const linkMatch = /^\[([^\]\n]+)\]\(([^)\s\n]+)\)$/.exec(part);
      if (linkMatch) {
        const label = linkMatch[1];
        const rawHref = linkMatch[2];
        const safeHref = sanitizeExternalUrl(rawHref);
        if (safeHref) {
          tokens.push({ type: 'link', content: label, href: safeHref });
        } else {
          // Neutralize unsafe URI schemes cleanly without executing links
          tokens.push({ type: 'text', content: `[${label}]` });
        }
        continue;
      }
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      tokens.push({ type: 'bold', content: part.slice(2, -2) });
      continue;
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      tokens.push({ type: 'code', content: part.slice(1, -1) });
      continue;
    }

    if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**') && part.length >= 2) {
      tokens.push({ type: 'italic', content: part.slice(1, -1) });
      continue;
    }

    tokens.push({ type: 'text', content: part });
  }

  return tokens;
}

