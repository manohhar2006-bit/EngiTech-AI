import React from 'react';
import { Button } from '../ui/Button';
import { ArrowRight, GitBranch } from 'lucide-react';

interface FinalCtaSectionProps {
  onLaunchClick?: () => void;
}

export const FinalCtaSection: React.FC<FinalCtaSectionProps> = ({ onLaunchClick }) => {
  return (
    <section className="py-24 relative overflow-hidden bg-radial-hero border-t border-slate-800/60">
      <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
        
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-purple-600 p-0.5 mx-auto mb-8 shadow-2xl shadow-cyan-500/20 animate-float">
          <div className="w-full h-full bg-[#070A12] rounded-[14px] flex items-center justify-center">
            <GitBranch className="w-8 h-8 text-cyan-400" />
          </div>
        </div>

        <h2 className="text-4xl sm:text-5xl font-extrabold font-display text-white tracking-tight leading-tight">
          Every codebase has an origin story.
        </h2>
        <p className="mt-4 text-xl sm:text-2xl text-cyan-300 font-display font-medium">
          EngiTrace helps you remember it.
        </p>

        <p className="mt-6 text-slate-300 text-base max-w-xl mx-auto leading-relaxed">
          Stop guessing why your software became what it is. Reconstruct historical reasoning, uncover hidden dependencies, and eliminate architectural decision debt.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button
            variant="primary"
            size="lg"
            icon={<ArrowRight className="w-4 h-4" />}
            onClick={onLaunchClick}
          >
            Explore EngiTrace
          </Button>
        </div>

      </div>
    </section>
  );
};
