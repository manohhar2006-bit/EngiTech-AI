import React, { useState } from 'react';
import { SectionHeader } from '../ui/SectionHeader';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  History,
  GitCommit,
  GitBranch,
  GitMerge,
  ShieldCheck,
  ArrowRight,
  Clock,
  Layers,
  FileCode,
  Sparkles,
  CheckCircle2,
  BrainCircuit,
  ExternalLink
} from 'lucide-react';

interface EngineeringHistorySectionProps {
  onExploreGitGraph?: () => void;
}

interface HistoryPillar {
  id: string;
  title: string;
  tagline: string;
  icon: React.ReactNode;
  summary: string;
  badge: string;
  badgeVariant: 'cyan' | 'purple' | 'emerald' | 'amber';
  features: string[];
  mockNodes: Array<{
    hash: string;
    label: string;
    author: string;
    date: string;
    tag: string;
    classification: 'FACT' | 'INFERENCE';
    branch: string;
  }>;
}

const HISTORY_PILLARS: HistoryPillar[] = [
  {
    id: 'git-lineage',
    title: 'Commit Lineage & Topology',
    tagline: 'Topological commit graph with parent-child linkage',
    icon: <History className="w-5 h-5 text-cyan-400" />,
    summary:
      'EngiTrace reconstructs true repository Git history as a directed acyclic graph. Trace parent commits, branch forks, and merge relationships with lane-based visualization.',
    badge: 'GIT GRAPH',
    badgeVariant: 'cyan',
    features: [
      'Chronological commit DAG with parent-child relationships',
      'Multi-lane branch visualization with merge connector lines',
      'Direct selection and inspection of any commit in repository history'
    ],
    mockNodes: [
      {
        hash: 'c-4a11be',
        label: 'feat(auth): migrate session tokens to stateless JWT',
        author: 'Elena Rostova',
        date: '2 days ago',
        tag: 'MERGE',
        classification: 'FACT',
        branch: 'main'
      },
      {
        hash: 'c-8af42d',
        label: 'perf(db): increase connection pool size for checkout surge',
        author: 'Alex Rivera',
        date: '1 week ago',
        tag: 'COMMIT',
        classification: 'FACT',
        branch: 'perf/db-pool'
      },
      {
        hash: 'c-01a9df',
        label: 'feat(core): initial modular architecture decomposition',
        author: 'Sarah Chen',
        date: '3 weeks ago',
        tag: 'ROOT',
        classification: 'FACT',
        branch: 'main'
      }
    ]
  },
  {
    id: 'evidence-linking',
    title: 'Evidence-Linked Change History',
    tagline: 'Connect every commit to PRs, issues, and decisions',
    icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
    summary:
      'Commits are not isolated diffs. EngiTrace connects commits directly to pull request discussions, issue tickets, and architectural decision rationale.',
    badge: 'GROUNDED EVIDENCE',
    badgeVariant: 'emerald',
    features: [
      'Bi-directional links between code changes and GitHub discussions',
      'Distinction between verified factual records and inferred assumptions',
      'Cryptographically grounded SHA-256 evidence trail for compliance'
    ],
    mockNodes: [
      {
        hash: 'PR-194',
        label: 'Security review for stateless token revocation strategy',
        author: 'Security Team',
        date: 'Approved',
        tag: 'PULL REQUEST',
        classification: 'FACT',
        branch: 'auth/jwt'
      },
      {
        hash: 'ISSUE-280',
        label: 'Checkout latency spike under Redis session bottleneck',
        author: 'Ops Monitor',
        date: 'Resolved',
        tag: 'ISSUE',
        classification: 'FACT',
        branch: 'main'
      },
      {
        hash: 'ADR-089',
        label: 'Architectural Decision Record: JWT Authentication Standard',
        author: 'Architecture Guild',
        date: 'Accepted',
        tag: 'DECISION',
        classification: 'FACT',
        branch: 'docs'
      }
    ]
  },
  {
    id: 'node-timelines',
    title: 'Node-Level Historical Timelines',
    tagline: 'Chronological progression for any component or file',
    icon: <Clock className="w-5 h-5 text-purple-400" />,
    summary:
      'Select any file, component, or package in the Engineering Graph to view its chronological change history in context, explaining how and why it reached its current state.',
    badge: 'IN-CONTEXT TIMELINE',
    badgeVariant: 'purple',
    features: [
      'On-demand chronological history retrieval via repository history API',
      'Component-level change progression across multiple release cycles',
      'Clear, honest empty states when no historical churn exists'
    ],
    mockNodes: [
      {
        hash: 'v2.4.0',
        label: 'PaymentService: integrated idempotency key middleware',
        author: 'Alex Rivera',
        date: 'Oct 2026',
        tag: 'REFACTOR',
        classification: 'FACT',
        branch: 'main'
      },
      {
        hash: 'v2.1.0',
        label: 'PaymentService: decoupled direct DB queries into Repository layer',
        author: 'Sarah Chen',
        date: 'Aug 2026',
        tag: 'ARCHITECTURE',
        classification: 'FACT',
        branch: 'refactor/dal'
      },
      {
        hash: 'v1.0.0',
        label: 'PaymentService: initial production implementation',
        author: 'Sarah Chen',
        date: 'Mar 2026',
        tag: 'CREATED',
        classification: 'FACT',
        branch: 'main'
      }
    ]
  }
];

export const TimeMachineSection: React.FC<EngineeringHistorySectionProps> = ({ onExploreGitGraph }) => {
  const [activePillarId, setActivePillarId] = useState<string>(HISTORY_PILLARS[0].id);

  const activePillar = HISTORY_PILLARS.find((p) => p.id === activePillarId) || HISTORY_PILLARS[0];

  const handleLaunch = () => {
    if (onExploreGitGraph) {
      onExploreGitGraph();
    } else {
      window.location.href = '/whygraph?view=git_graph';
    }
  };

  return (
    <section id="history" className="py-24 relative bg-[#070A12] border-t border-slate-800/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        <SectionHeader
          eyebrow="ENGINEERING MEMORY GRAPH"
          title="Explore Engineering History"
          subtitle="Trace the evolution of your codebase through commits, branches, architectural changes, and historical engineering evidence."
        />

        {/* Pillar Selection Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10 max-w-3xl mx-auto">
          {HISTORY_PILLARS.map((pillar) => {
            const isActive = pillar.id === activePillar.id;
            return (
              <button
                key={pillar.id}
                onClick={() => setActivePillarId(pillar.id)}
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all duration-200 cursor-pointer ${isActive
                    ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-600/30 scale-105'
                    : 'bg-slate-900/90 text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-700'
                  }`}
              >
                {pillar.icon}
                <span>{pillar.title}</span>
              </button>
            );
          })}
        </div>

        {/* Active Pillar Deep Dive Showcase */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">

          {/* Left Column: Pillar Details & Capabilities */}
          <div className="lg:col-span-5 flex flex-col justify-between">
            <GlassCard glow={activePillar.badgeVariant} className="p-8 h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Badge variant={activePillar.badgeVariant}>{activePillar.badge}</Badge>
                  <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                    <BrainCircuit className="w-3.5 h-3.5 text-cyan-400" />
                    Engineering Graph Integrated
                  </span>
                </div>

                <h3 className="text-2xl font-bold font-display text-white mb-2">
                  {activePillar.title}
                </h3>
                <p className="text-xs font-mono text-cyan-300 mb-4">{activePillar.tagline}</p>
                <p className="text-slate-300 text-sm leading-relaxed mb-6 font-sans">
                  {activePillar.summary}
                </p>

                {/* Core Capabilities Checklist */}
                <div className="space-y-3 pt-4 border-t border-slate-800/80">
                  <h5 className="text-[11px] font-mono uppercase text-slate-400 font-semibold tracking-wider">
                    Key Graph Capabilities
                  </h5>
                  {activePillar.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-300 font-sans">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action CTA */}
              <div className="pt-6 mt-6 border-t border-slate-800/80">
                <Button
                  variant="primary"
                  size="md"
                  className="w-full justify-center shadow-lg shadow-cyan-500/20"
                  icon={<ArrowRight className="w-4 h-4" />}
                  onClick={handleLaunch}
                >
                  Explore in Engineering Graph
                </Button>
              </div>
            </GlassCard>
          </div>

          {/* Right Column: Interactive Evidence & Commit Lineage Preview */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="glass-panel p-6 sm:p-8 rounded-2xl border-slate-800/80 bg-slate-950/60 shadow-2xl flex-1 flex flex-col justify-between">
              <div>
                {/* Header Bar */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                      Real Repository Intelligence Preview
                    </span>
                  </div>
                  <Badge variant="cyan" className="font-mono text-[10px]">
                    LIVE GIT DATA
                  </Badge>
                </div>

                <p className="text-xs text-slate-400 mb-4 font-mono">
                  Sample records reconstructed from repository history and connected graph evidence:
                </p>

                {/* Event Cards */}
                <div className="space-y-3">
                  {activePillar.mockNodes.map((node) => (
                    <div
                      key={node.hash}
                      className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 transition-all duration-200 group"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-cyan-400 group-hover:text-cyan-300 flex items-center gap-1">
                            <GitCommit className="w-3.5 h-3.5 text-cyan-400" />
                            {node.hash}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                            {node.tag}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-slate-400">{node.date}</span>
                          <Badge variant="emerald" className="text-[9px] py-0 px-1.5">
                            {node.classification}
                          </Badge>
                        </div>
                      </div>

                      <p className="text-xs text-slate-200 font-sans font-medium line-clamp-1">
                        {node.label}
                      </p>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2.5 pt-2 border-t border-slate-800/60">
                        <span className="flex items-center gap-1 text-slate-300">
                          <GitBranch className="w-3 h-3 text-indigo-400" />
                          Branch: <strong className="text-cyan-300">{node.branch}</strong>
                        </span>
                        <span>Author: {node.author}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom Notice */}
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  100% grounded in real Git commits and AST analysis
                </span>
                <button
                  onClick={handleLaunch}
                  className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>Open Git History View</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
};

// Also export as EngineeringHistorySection for modern imports
export const EngineeringHistorySection = TimeMachineSection;
export default TimeMachineSection;
