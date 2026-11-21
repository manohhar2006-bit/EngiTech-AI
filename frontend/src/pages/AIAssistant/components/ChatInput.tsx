import React, { useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  HelpCircle,
  Zap,
  Layers,
  CornerDownLeft,
  Loader2
} from 'lucide-react';
import { InvestigationMode } from '../../../types/aiAssistant';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  mode: InvestigationMode;
  onModeChange: (mode: InvestigationMode) => void;
  targetLabel?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  onSend,
  isLoading,
  mode,
  onModeChange,
  targetLabel
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim()) {
        onSend();
      }
    }
  };

  const getPlaceholderText = () => {
    if (mode === 'WHY') {
      return `Ask why ${targetLabel || 'this file'} exists, which commit modified it, or who authored it...`;
    }
    if (mode === 'WHAT_IF') {
      return `Ask what happens if ${targetLabel || 'this component'} is removed, affected dependents, or impact risk...`;
    }
    return `Ask about this repository, architecture, components, dependencies, or decisions...`;
  };

  return (
    <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-[#070A12]/95 backdrop-blur-md sticky bottom-0 shrink-0 z-10">
      <div className="max-w-4xl mx-auto space-y-3">
        {/* Mode Selector Tabs */}
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => onModeChange('WHY')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                mode === 'WHY'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>WHY</span>
            </button>

            <button
              onClick={() => onModeChange('WHAT_IF')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                mode === 'WHAT_IF'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>WHAT IF</span>
            </button>

            <button
              onClick={() => onModeChange('GENERAL')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                mode === 'GENERAL'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>GENERAL</span>
            </button>
          </div>

          <span className="text-[11px] text-slate-500 hidden sm:inline">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400 mr-1">
              Enter
            </kbd>
            to send,
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400 mx-1">
              Shift+Enter
            </kbd>
            for newline
          </span>
        </div>

        {/* Textarea & Send Input Box */}
        <div className="relative rounded-2xl bg-slate-900/90 border border-slate-800 focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/30 transition-all shadow-xl">
          <textarea
            ref={textareaRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholderText()}
            disabled={isLoading}
            className="w-full px-4 pt-3.5 pb-12 bg-transparent text-slate-200 placeholder-slate-500 text-xs sm:text-sm font-sans focus:outline-none resize-none disabled:opacity-50"
          />

          {/* Bottom Toolbar inside Input Box */}
          <div className="absolute left-3 right-3 bottom-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Grounded on Repository Evidence</span>
            </div>

            <button
              onClick={onSend}
              disabled={isLoading || !input.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 disabled:from-slate-800 disabled:to-slate-800 text-slate-950 disabled:text-slate-500 font-bold text-xs shadow-lg shadow-cyan-500/20 disabled:shadow-none transition-all cursor-pointer disabled:cursor-not-allowed active:scale-95"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Investigating...</span>
                </>
              ) : (
                <>
                  <span>Send</span>
                  <CornerDownLeft className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

