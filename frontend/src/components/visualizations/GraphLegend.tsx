/**
 * GraphLegend — compact, mode-aware legend for the EngiTrace graph visualization.
 * Changes content based on the active graph mode.
 */

import React from 'react';

export type GraphMode = 'HISTORY' | 'ARCHITECTURE' | 'DEPENDENCIES' | 'DECISIONS' | 'WHY' | 'WHAT_IF';

interface LegendItem {
  color: string;
  label: string;
  dashed?: boolean;
  shape?: 'circle' | 'line' | 'square';
}

const LEGENDS: Record<GraphMode, LegendItem[]> = {
  HISTORY: [
    { color: '#22d3ee', label: 'Commit', shape: 'circle' },
    { color: '#818cf8', label: 'Branch commit', shape: 'circle' },
    { color: '#34d399', label: 'Feature branch', shape: 'circle' },
    { color: '#22d3ee', label: 'Connection', shape: 'line' },
    { color: '#6366f1', label: 'Selected', shape: 'circle' },
    { color: '#f97316', label: 'Merge commit', shape: 'circle' },
  ],
  ARCHITECTURE: [
    { color: '#10b981', label: 'File', shape: 'circle' },
    { color: '#06b6d4', label: 'Component', shape: 'circle' },
    { color: '#ec4899', label: 'Dependency', shape: 'circle' },
    { color: '#14b8a6', label: 'Function', shape: 'circle' },
    { color: 'rgba(255,255,255,0.3)', label: 'FACT edge', shape: 'line' },
    { color: '#f59e0b', label: 'INFERENCE edge', shape: 'line', dashed: true },
  ],
  DEPENDENCIES: [
    { color: '#c084fc', label: 'Dependency Node', shape: 'circle' },
    { color: '#22d3ee', label: 'Selected Package', shape: 'circle' },
    { color: '#10b981', label: 'Dependent File', shape: 'circle' },
    { color: '#818cf8', label: 'Component / Service', shape: 'circle' },
    { color: '#c084fc', label: 'DEPENDS_ON relationship', shape: 'line' },
  ],
  DECISIONS: [
    { color: '#c084fc', label: 'Decision Node', shape: 'circle' },
    { color: '#818cf8', label: 'Pull Request', shape: 'circle' },
    { color: '#f59e0b', label: 'Issue / Rationale', shape: 'circle' },
    { color: '#22d3ee', label: 'Commit', shape: 'circle' },
    { color: '#10b981', label: 'Component / File', shape: 'circle' },
    { color: '#10b981', label: 'FACT relationship', shape: 'line' },
    { color: '#f59e0b', label: 'INFERENCE relationship', shape: 'line', dashed: true },
  ],
  WHY: [
    { color: '#22d3ee', label: 'Historical chain', shape: 'circle' },
    { color: '#10b981', label: 'Confirmed FACT', shape: 'circle' },
    { color: '#f59e0b', label: 'INFERENCE', shape: 'circle' },
    { color: 'rgba(100,116,139,0.4)', label: 'Unrelated (dimmed)', shape: 'circle' },
    { color: '#22d3ee', label: 'Evidence path', shape: 'line' },
  ],
  WHAT_IF: [
    { color: '#f97316', label: 'Target component', shape: 'circle' },
    { color: '#ef4444', label: 'Direct impact', shape: 'circle' },
    { color: '#f59e0b', label: 'Indirect impact', shape: 'circle' },
    { color: 'rgba(30,41,59,0.8)', label: 'Unrelated', shape: 'circle' },
    { color: '#ef4444', label: 'Critical path', shape: 'line' },
  ],
};

interface GraphLegendProps {
  mode: GraphMode;
  className?: string;
}

export const GraphLegend: React.FC<GraphLegendProps> = ({ mode, className = '' }) => {
  const items = LEGENDS[mode];

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
      {items.map((item, idx) => (
        <span key={idx} className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
          {item.shape === 'circle' ? (
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: item.color }}
            />
          ) : (
            <span
              className="w-5 h-0.5 flex-shrink-0"
              style={{
                background: item.color,
                borderTop: item.dashed ? `1px dashed ${item.color}` : 'none',
              }}
            />
          )}
          {item.label}
        </span>
      ))}
    </div>
  );
};
