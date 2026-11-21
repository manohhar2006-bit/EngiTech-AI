import React from 'react';
import { SectionHeader } from '../ui/SectionHeader';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { AlertTriangle, Clock, HelpCircle, FileX, GitCommit, FileText } from 'lucide-react';

export const ProblemSection: React.FC = () => {
  return (
    <section className="py-24 relative bg-[#070A12] border-t border-slate-800/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <SectionHeader
          eyebrow="THE HIDDEN COST OF FORGOTTEN REASONING"
          title="Software has memory. People don't."
          subtitle="Every repository is filled with micro-architectural workarounds, emergency hotfixes, and temporary assumptions. When original developers leave, the true reasoning evaporates."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Card 1: Decayed Rationale */}
          <GlassCard glow="amber" className="flex flex-col h-full">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6">
              <FileX className="w-6 h-6" />
            </div>
            <div className="mb-2">
              <Badge variant="amber" icon={<HelpCircle className="w-3 h-3" />}>
                Documentation Decay
              </Badge>
            </div>
            <h3 className="text-xl font-bold font-display text-white mt-3">
              "Why was this 300s TTL added?"
            </h3>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed flex-1">
              Architecture specs in Confluence or Google Docs freeze the day they are written. Code evolves daily. The gap between written documentation and actual code reality grows exponentially.
            </p>
            <div className="mt-6 pt-4 border-t border-slate-800/80 font-mono text-xs text-amber-400/90 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Result: Developers treat old code as untouchable black boxes.</span>
            </div>
          </GlassCard>

          {/* Card 2: Human Amnesia */}
          <GlassCard glow="cyan" className="flex flex-col h-full">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-6">
              <Clock className="w-6 h-6" />
            </div>
            <div className="mb-2">
              <Badge variant="cyan" icon={<GitCommit className="w-3 h-3" />}>
                Team Turnover & Memory Loss
              </Badge>
            </div>
            <h3 className="text-xl font-bold font-display text-white mt-3">
              "Alex left 6 months ago..."
            </h3>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed flex-1">
              When senior engineers depart, their mental map of past outages, PR tradeoffs, and database connection pool bottlenecks leaves with them. New engineers spend weeks re-discovering past lessons.
            </p>
            <div className="mt-6 pt-4 border-t border-slate-800/80 font-mono text-xs text-cyan-400/90 flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              <span>Result: Re-introducing bugs solved two years prior.</span>
            </div>
          </GlassCard>

          {/* Card 3: Decision Debt Accumulation */}
          <GlassCard glow="purple" className="flex flex-col h-full">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-6">
              <FileText className="w-6 h-6" />
            </div>
            <div className="mb-2">
              <Badge variant="purple" icon={<AlertTriangle className="w-3 h-3" />}>
                Silent Decision Debt
              </Badge>
            </div>
            <h3 className="text-xl font-bold font-display text-white mt-3">
              "Temporary hotfixes become permanent"
            </h3>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed flex-1">
              An emergency bypass added during a 2 AM Black Friday outage remains in production for 3 years because no developer understands the original incident context.
            </p>
            <div className="mt-6 pt-4 border-t border-slate-800/80 font-mono text-xs text-purple-400/90 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Result: Brittle software architecture & slow velocity.</span>
            </div>
          </GlassCard>

        </div>
      </div>
    </section>
  );
};
