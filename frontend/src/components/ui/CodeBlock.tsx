import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  filename
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl bg-[#090D16] border border-slate-800/80 overflow-hidden font-mono text-xs text-slate-300">
      {filename && (
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-slate-800/80 text-slate-400 text-[11px]">
          <span>{filename}</span>
          <button
            onClick={handleCopy}
            className="hover:text-slate-200 transition-colors p-1 rounded"
            title="Copy code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
      <div className="p-4 overflow-x-auto leading-relaxed font-mono">
        <pre>{code}</pre>
      </div>
    </div>
  );
};
