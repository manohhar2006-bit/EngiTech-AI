import React from 'react';
import { GitBranch, Github, Twitter, Disc as Discord } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#04060A] border-t border-slate-800/80 py-12 text-slate-400 text-xs font-mono">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">

          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <GitBranch className="w-3.5 h-3.5" />
              </div>
              <span className="font-display font-bold text-white text-sm tracking-wider">
                ENGITRACE
              </span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed font-sans">
              Your Code Remembers. Your Team Forgot. Reconstructing historical software engineering reasoning.
            </p>
          </div>

          {/* Links 1 */}
          <div>
            <h5 className="font-bold text-slate-200 uppercase tracking-wider mb-3">Product</h5>
            <ul className="space-y-2">
              <li><a href="#whygraph" className="hover:text-cyan-400 transition-colors">WhyGraph Engine</a></li>
              <li><a href="#history" className="hover:text-cyan-400 transition-colors">Engineering History</a></li>
              <li><a href="#decision-debt" className="hover:text-cyan-400 transition-colors">Decision Debt Audit</a></li>
              <li><a href="/dashboard" className="hover:text-cyan-400 transition-colors">Command Center</a></li>
            </ul>
          </div>

          {/* Links 2 */}
          <div>
            <h5 className="font-bold text-slate-200 uppercase tracking-wider mb-3">Documentation</h5>
            <ul className="space-y-2">
              <li><a href="/docs" className="hover:text-cyan-400 transition-colors">Architecture Spec</a></li>
              <li><a href="/docs" className="hover:text-cyan-400 transition-colors">Graph Ontology</a></li>
              <li><a href="/docs" className="hover:text-cyan-400 transition-colors">Local Setup Guide</a></li>
              <li><a href="/docs" className="hover:text-cyan-400 transition-colors">Implementation Roadmap</a></li>
            </ul>
          </div>

          {/* Links 3 */}
          <div>
            <h5 className="font-bold text-slate-200 uppercase tracking-wider mb-3">System Status</h5>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-emerald-400 font-semibold">Phase 0 Foundation Online</span>
            </div>
            <p className="text-slate-500 text-[11px] leading-relaxed font-sans">
              Built for Prasunethon 2.0 Round 2.
            </p>
          </div>

        </div>

        <div className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} ENGITRACE. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="https://github.com" className="hover:text-white transition-colors" title="GitHub"><Github className="w-4 h-4" /></a>
            <a href="#" className="hover:text-white transition-colors" title="Twitter"><Twitter className="w-4 h-4" /></a>
            <a href="#" className="hover:text-white transition-colors" title="Discord"><Discord className="w-4 h-4" /></a>
          </div>
        </div>
      </div>
    </footer>
  );
};
