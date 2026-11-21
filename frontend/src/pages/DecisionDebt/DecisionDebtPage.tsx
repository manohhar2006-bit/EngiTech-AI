import React from 'react';
import { Sidebar } from '../../components/navigation/Sidebar';
import { DecisionDebtSection } from '../../components/sections/DecisionDebtSection';

interface DecisionDebtPageProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export const DecisionDebtPage: React.FC<DecisionDebtPageProps> = ({ currentRoute, onNavigate }) => {
  return (
    <div className="min-h-screen bg-[#05070C] text-slate-100 flex">
      <Sidebar currentRoute={currentRoute} onNavigate={onNavigate} />
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <header className="px-8 py-5 bg-[#070A12]/90 backdrop-blur border-b border-slate-800/80 sticky top-0 z-30">
          <h1 className="text-xl font-bold font-display text-white">Decision Debt Dashboard</h1>
          <p className="text-xs font-mono text-slate-400 mt-0.5">Quantifying Architectural Drift & Obsolete Rationale</p>
        </header>
        <div className="p-4 max-w-7xl mx-auto w-full">
          <DecisionDebtSection onNavigate={onNavigate} />
        </div>
      </main>
    </div>
  );
};
