import React, { useState, useCallback } from 'react';
import { GitGraphHeroCanvas } from '../visualizations/GitGraphHeroCanvas';
import { Button } from '../ui/Button';
import { Sparkles, ArrowRight, ShieldCheck, Cpu, Database } from 'lucide-react';
import { MOCK_METRICS } from '../../data/mockMetrics';

interface HeroSectionProps {
  onExploreClick?: () => void;
  onDemoClick?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onExploreClick,
  onDemoClick
}) => {
  const [isGraphComplete, setIsGraphComplete] = useState(false);

  const handleGraphAnimationComplete = useCallback(() => {
    setIsGraphComplete(true);
  }, []);

  return (
    <section className="relative min-h-[92vh] flex items-center justify-center pt-32 pb-24 overflow-hidden bg-[#05070C]">
      {/* 1. GitGraph Progressive Branching Visualization Canvas (Behind & Around Content) */}
      <GitGraphHeroCanvas
        className="z-0"
        onAnimationComplete={handleGraphAnimationComplete}
      />

      {/* 2. Atmospheric Grid Background */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none z-0" />

      {/* 3. Text Isolation Radial Overlay (Guarantees 100% legibility & focus) */}
      <div className="absolute inset-0 bg-radial-hero opacity-90 pointer-events-none z-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#05070C]/60 via-transparent to-[#05070C] pointer-events-none z-0" />

      {/* 4. Main Hero Centered Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center flex flex-col items-center">

        {/* Brand Header & Engineering Intelligence Subtitle */}
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 text-xs font-mono font-medium tracking-widest uppercase mb-8 shadow-lg shadow-cyan-500/10 backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
          <span className="font-bold tracking-widest text-slate-100">ENGITRACE</span>
          <span className="text-cyan-500/60">•</span>
          <span className="text-cyan-300 font-semibold tracking-widest">ENGINEERING INTELLIGENCE</span>
        </div>

        {/* Main Headline */}
        <h1
          className={`text-4xl sm:text-6xl md:text-7xl font-extrabold font-display text-white tracking-tight leading-[1.08] max-w-4xl transition-all duration-700 ${isGraphComplete ? 'headline-3d-glow-active' : ''
            }`}
        >
          Your Code Remembers.{' '}
          <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent block sm:inline mt-1 sm:mt-0">
            Your Team Forgot.
          </span>
        </h1>

        {/* Product Concept Narrative */}
        <p className="mt-6 sm:mt-8 text-base sm:text-xl text-slate-300 font-normal leading-relaxed max-w-2xl">
          EngiTrace reconstructs the historical reasoning behind complex software systems. We connect{' '}
          <span className="font-mono text-cyan-300 font-medium whitespace-nowrap sm:whitespace-normal">
            Code → Commits → Decisions → Dependencies → Incidents → Outcomes
          </span>.
        </p>

        {/* Call to Actions */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 sm:gap-5">
          <Button
            variant="primary"
            size="lg"
            icon={<ArrowRight className="w-5 h-5" />}
            onClick={onExploreClick}
            className="shadow-xl shadow-cyan-500/20"
          >
            Explore EngiTrace
          </Button>
          <Button
            variant="glass"
            size="lg"
            onClick={onDemoClick}
            className="backdrop-blur-md"
          >
            View Live Demo
          </Button>
        </div>

        {/* System Status Metrics Ticker */}
        <div className="mt-14 pt-8 border-t border-slate-800/80 w-full max-w-3xl glass-panel rounded-2xl p-6 border border-slate-800/90 shadow-2xl backdrop-blur-xl bg-slate-950/40">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-4 text-center">
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <Database className="w-4 h-4 text-cyan-400" />
                <span className="tracking-wider">NODES INDEXED</span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white mt-1.5 tracking-tight">
                {MOCK_METRICS.totalNodes.toLocaleString()}
              </div>
            </div>

            <div className="flex flex-col items-center sm:border-x sm:border-slate-800/80 px-4">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="tracking-wider">ACCURACY RATE</span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 mt-1.5 tracking-tight">
                {MOCK_METRICS.evidenceVerifiedRate}
              </div>
            </div>

            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <Cpu className="w-4 h-4 text-purple-400" />
                <span className="tracking-wider">DEBT ALERTS</span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-purple-400 mt-1.5 tracking-tight">
                {MOCK_METRICS.activeIncidentsLinked}
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
