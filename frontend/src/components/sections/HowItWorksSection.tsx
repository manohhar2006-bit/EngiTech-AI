import React, { useState } from 'react';
import { SectionHeader } from '../ui/SectionHeader';
import { GlassCard } from '../ui/GlassCard';
import { GitBranch, Cpu, Network, MessageSquareCode, CheckCircle2 } from 'lucide-react';

export const HowItWorksSection: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      number: '01',
      id: 'CONNECT_REPO',
      title: '1. CONNECT',
      subtitle: 'Connect your repository',
      icon: <GitBranch className="w-5 h-5" />,
      description: 'Connect GitHub, GitLab, or local repository. EngiTrace scans Git commit histories, PR discussions, blame ranges, issue tickets, and incident post-mortems.',
      details: ['Zero code modification needed', 'Supports TS/JS, Python, Go, Java', 'Secure read-only AST parser']
    },
    {
      number: '02',
      id: 'RECONSTRUCT',
      title: '2. RECONSTRUCT',
      subtitle: 'Analyze code & engineering history',
      icon: <Cpu className="w-5 h-5" />,
      description: 'The AST and Git parser extract every micro-change, mapping line-by-line diff churn directly to historical pull requests and author timelines.',
      details: ['Tree-sitter AST extraction', 'Git commit mining & blame linking', 'PR discussion sentiment & rationale']
    },
    {
      number: '03',
      id: 'WHYGRAPH',
      title: '3. CONNECT (WhyGraph™)',
      subtitle: 'Build the WhyGraph™',
      icon: <Network className="w-5 h-5" />,
      description: 'EngiTrace connects 8 distinct node types into a temporal graph: Code → Commits → Decisions → Dependencies → Issues → Incidents → Outcomes.',
      details: ['Temporal directed edges', 'Cross-file dependency paths', 'Incident-to-commit attribution']
    },
    {
      number: '04',
      id: 'EXPLAIN',
      title: '4. EXPLAIN',
      subtitle: 'Understand why the system exists',
      icon: <MessageSquareCode className="w-5 h-5" />,
      description: 'Ask any natural language question. EngiTrace provides verified, evidence-backed explanations referencing exact commit hashes, PRs, and authors.',
      details: ['100% evidence-grounded responses', 'Zero hallucinated rationale', 'Decision Debt risk scoring']
    }
  ];

  return (
    <section id="how-it-works" className="py-24 relative bg-[#05070C]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <SectionHeader
          eyebrow="RECONSTRUCTION ENGINE"
          title="How EngiTrace Reconstructs Reasoning"
          subtitle="A 4-step pipeline that transforms raw Git histories and static code into a living engineering intelligence graph."
        />

        {/* Desktop Interactive Steps Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Step Selectors (Left List) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                onClick={() => setActiveStep(idx)}
                className={`cursor-pointer transition-all duration-300 p-5 rounded-2xl border ${
                  activeStep === idx
                    ? 'bg-slate-900/90 border-cyan-500/50 shadow-xl shadow-cyan-500/10 translate-x-2'
                    : 'glass-panel border-slate-800/60 hover:border-slate-700 hover:bg-slate-900/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono text-xs font-bold ${
                        activeStep === idx
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {step.number}
                    </span>
                    <div>
                      <h4 className="text-base font-bold text-white">{step.title}</h4>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{step.subtitle}</p>
                    </div>
                  </div>
                  {activeStep === idx && (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Step Deep Dive View Panel (Right) */}
          <div className="lg:col-span-7">
            <GlassCard glow="cyan" className="p-8 min-h-[380px] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                  <div className="flex items-center gap-3 text-cyan-400 font-mono font-bold text-sm">
                    <span className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                      {steps[activeStep].icon}
                    </span>
                    <span>STAGE {steps[activeStep].number} // {steps[activeStep].title}</span>
                  </div>
                  <span className="text-xs font-mono text-slate-500">Pipeline Active</span>
                </div>

                <h3 className="text-2xl font-extrabold font-display text-white mb-4">
                  {steps[activeStep].subtitle}
                </h3>
                <p className="text-slate-300 leading-relaxed text-base">
                  {steps[activeStep].description}
                </p>

                <div className="mt-8 pt-6 border-t border-slate-800/80">
                  <h5 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider mb-4">
                    Key Architectural Capabilities
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {steps[activeStep].details.map((detail) => (
                      <div key={detail} className="flex items-center gap-2 text-xs font-mono text-slate-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 flex items-center justify-between text-xs font-mono text-slate-500">
                <span>EngiTrace Core Engine v0.1</span>
                <span>Click tabs to explore stages</span>
              </div>
            </GlassCard>
          </div>

        </div>
      </div>
    </section>
  );
};
