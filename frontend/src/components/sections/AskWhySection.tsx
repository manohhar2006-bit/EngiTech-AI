import React, { useState } from 'react';
import { SectionHeader } from '../ui/SectionHeader';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/Button';
import { Search, Sparkles, CheckCircle2, ShieldCheck, GitCommit, FileText, ArrowRight } from 'lucide-react';

export const AskWhySection: React.FC = () => {
  const [query, setQuery] = useState('Why does PaymentService use Redis?');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showResult, setShowResult] = useState(true);

  const sampleQueries = [
    'Why does PaymentService use Redis?',
    'Why did we migrate to JWT auth in March 2025?',
    'Who introduced the 300s TTL in cache wrapper?'
  ];

  const handleQuerySubmit = (q: string) => {
    setQuery(q);
    setIsAnalyzing(true);
    setShowResult(false);
    setTimeout(() => {
      setIsAnalyzing(false);
      setShowResult(true);
    }, 600);
  };

  return (
    <section id="whygraph" className="py-24 relative bg-[#05070C]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <SectionHeader
          eyebrow="EVIDENCE-BACKED REASONING"
          title="Ask WHY. Get Verified Evidence."
          subtitle="Not a generic chatbot. EngiTrace provides non-hallucinated explanations strictly backed by Git commits, pull requests, and incident post-mortems."
        />

        {/* Command Style Input Bar */}
        <div className="max-w-3xl mx-auto mb-10">
          <div className="relative glass-panel rounded-2xl p-2 border-cyan-500/30 shadow-2xl flex items-center gap-3">
            <div className="pl-3 text-cyan-400">
              <Search className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuerySubmit(query)}
              placeholder="Ask why any class, function, or dependency exists..."
              className="w-full bg-transparent border-none text-slate-100 placeholder-slate-500 focus:outline-none font-mono text-sm sm:text-base py-2"
            />
            <Button
              variant="primary"
              size="md"
              icon={isAnalyzing ? <Sparkles className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              onClick={() => handleQuerySubmit(query)}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? 'Tracing...' : 'Analyze WHY'}
            </Button>
          </div>

          {/* Quick Query Sample Tickers */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs font-mono text-slate-400">
            <span className="text-slate-500">Sample Queries:</span>
            {sampleQueries.map((sq) => (
              <button
                key={sq}
                onClick={() => handleQuerySubmit(sq)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors cursor-pointer"
              >
                {sq}
              </button>
            ))}
          </div>
        </div>

        {/* Evidence Card Output Result */}
        {showResult && (
          <div className="max-w-3xl mx-auto">
            <GlassCard glow="cyan" className="p-8 border-cyan-500/30 shadow-2xl">
              
              {/* Card Header: Confidence & Result Status */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>REASON DISCOVERED // WHYGRAPH™ RECONSTRUCTION</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">
                  <span>CONFIDENCE 94%</span>
                </div>
              </div>

              {/* Discovered Rationale Headline */}
              <h4 className="text-xl font-bold font-display text-white mb-3 leading-snug">
                Redis caching was introduced to mitigate PostgreSQL connection pool exhaustion during a Black Friday outage.
              </h4>

              {/* Rationale Explanation */}
              <p className="text-slate-300 text-sm leading-relaxed mb-6">
                On November 12, 2024, a peak checkout surge of 15,000 req/sec exhausted PostgreSQL connection pool capacity (max 50). Staff Infra Engineer <span className="font-mono text-cyan-300">Alex Rivera</span> bypassed the database ORM for hot-path payment transactions by wrapping read calls with Redis caching (<span className="font-mono text-pink-400">ioredis v5.3.0</span>) with a hardcoded 300-second TTL.
              </p>

              {/* Evidence Bullet Points */}
              <div className="p-4 rounded-xl bg-[#090D16] border border-slate-800/80 mb-6">
                <h5 className="text-xs font-mono font-semibold text-slate-400 uppercase mb-3 tracking-wider">
                  Verified Historical Evidence Trail
                </h5>
                <div className="space-y-2 font-mono text-xs text-slate-200">
                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Commit #8af42d91 — feat(cache): add Redis caching wrapper</span>
                    </div>
                    <span className="text-slate-400 text-[11px]">Nov 15, 2024</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <GitCommit className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>Issue #142 — DB Pool Exhaustion in Peak Checkout Surge</span>
                    </div>
                    <span className="text-slate-400 text-[11px]">Nov 13, 2024</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>PR #87 — Emergency Cache Circuit-Breaker Integration</span>
                    </div>
                    <span className="text-slate-400 text-[11px]">Merged</span>
                  </div>
                </div>
              </div>

              {/* Footer Audit stamp */}
              <div className="flex items-center justify-between text-xs font-mono text-slate-500 pt-2 border-t border-slate-800/60">
                <span>AST AST & Git Mining Verified</span>
                <span>Source: engitrace/engineering-core</span>
              </div>

            </GlassCard>
          </div>
        )}

      </div>
    </section>
  );
};
