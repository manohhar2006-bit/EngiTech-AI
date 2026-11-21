import React from 'react';
import { Sidebar } from '../../components/navigation/Sidebar';
import { GlassCard } from '../../components/ui/GlassCard';
import { Badge } from '../../components/ui/Badge';
import { BookOpen, FileText, Network, ShieldCheck } from 'lucide-react';

interface DocsPageProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export const DocsPage: React.FC<DocsPageProps> = ({ currentRoute, onNavigate }) => {
  const docs = [
    { title: 'System Architecture Spec', file: 'docs/architecture.md', summary: 'Multi-tier system design, frontend layer, analyzer API boundaries, and graph data flow.' },
    { title: 'WhyGraph™ Data Model Ontology', file: 'docs/graph-model.md', summary: 'Specifications for 8 node types (COMMIT, DECISION, FILE, FUNCTION, ISSUE, DEPENDENCY, INCIDENT, AUTHOR) & temporal edges.' },
    { title: 'Product Implementation Roadmap', file: 'docs/roadmap.md', summary: 'Phase 0 through Phase 4 timeline, Git mining algorithms, and CI/CD bot integrations.' },
    { title: 'Local Setup & Execution Guide', file: 'docs/setup.md', summary: 'Commands, prerequisites, environment setup (.env.example), and npm build verification.' }
  ];

  return (
    <div className="min-h-screen bg-[#05070C] text-slate-100 flex">
      <Sidebar currentRoute={currentRoute} onNavigate={onNavigate} />
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <header className="px-8 py-5 bg-[#070A12]/90 backdrop-blur border-b border-slate-800/80 sticky top-0 z-30">
          <h1 className="text-xl font-bold font-display text-white">Documentation & Architecture Specs</h1>
          <p className="text-xs font-mono text-slate-400 mt-0.5">EngiTrace Technical Manuals</p>
        </header>
        <div className="p-8 space-y-6 max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {docs.map((doc) => (
              <GlassCard key={doc.file} glow="cyan" className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="cyan"><BookOpen className="w-3 h-3" /> SPECIFICATION</Badge>
                  <span className="text-[11px] font-mono text-slate-500">{doc.file}</span>
                </div>
                <h3 className="text-lg font-bold font-display text-white">{doc.title}</h3>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">{doc.summary}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};
