import React from 'react';
import { Sparkles, ArrowRight, HelpCircle } from 'lucide-react';

interface SuggestedQuestionsPanelProps {
  questions: string[];
  onSelectQuestion: (question: string) => void;
  isLoading: boolean;
}

export const SuggestedQuestionsPanel: React.FC<SuggestedQuestionsPanelProps> = ({
  questions,
  onSelectQuestion,
  isLoading
}) => {
  return (
    <div className="p-4 rounded-2xl bg-[#0A0E1A]/95 border border-slate-800 shadow-xl space-y-3 font-mono text-xs select-none">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <h3 className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Suggested Questions</span>
        </h3>
        <span className="text-[10px] text-slate-500">Click to ask</span>
      </div>

      <div className="space-y-1.5">
        {questions.length === 0 ? (
          <p className="text-slate-500 py-3 text-center font-sans text-xs">
            No suggestions available.
          </p>
        ) : (
          questions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => onSelectQuestion(q)}
              disabled={isLoading}
              className="w-full p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-cyan-500/40 text-left text-[11px] text-slate-300 hover:text-white transition-all flex items-start justify-between gap-2 group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="font-sans leading-relaxed line-clamp-2">{q}</span>
              <ArrowRight className="w-3 h-3 text-cyan-400 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
            </button>
          ))
        )}
      </div>
    </div>
  );
};

