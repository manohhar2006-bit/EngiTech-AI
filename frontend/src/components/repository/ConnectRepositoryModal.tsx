import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { GlassCard } from '../ui/GlassCard';
import { ApiService } from '../../services/apiService';
import { AnalysisSummary, RepositoryMetadata } from '../../types/evidence';
import { GitBranch, Search, Sparkles, CheckCircle2, AlertCircle, Loader2, X, ExternalLink } from 'lucide-react';

interface ConnectRepositoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: { summary: AnalysisSummary; repository: RepositoryMetadata }) => void;
}

export const ConnectRepositoryModal: React.FC<ConnectRepositoryModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const presets = [
    { label: 'facebook/react', url: 'https://github.com/facebook/react' },
    { label: 'expressjs/express', url: 'https://github.com/expressjs/express' },
    { label: 'vercel/next.js', url: 'https://github.com/vercel/next.js' }
  ];

  const steps = [
    'Connecting to GitHub REST API',
    'Fetching Repository Metadata',
    'Reading Directory Tree Structure',
    'Extracting Git Commits & Changed Files',
    'Extracting Issues & Pull Requests',
    'Parsing Lightweight Dependency Manifests',
    'Normalizing Historical Evidence (FACT / INFERENCE)'
  ];

  const handleAnalyze = async (targetUrl: string) => {
    const cleanUrl = targetUrl.trim();
    if (!cleanUrl) {
      setErrorMsg('Please enter a valid GitHub repository URL.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);
    setCurrentStepIndex(0);

    // Animated step progress simulation sync
    const interval = setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev < steps.length - 1) return prev + 1;
        return prev;
      });
    }, 450);

    try {
      const result = await ApiService.analyzeRepository(cleanUrl);
      clearInterval(interval);
      setCurrentStepIndex(steps.length - 1);
      setTimeout(() => {
        setLoading(false);
        onSuccess(result);
        onClose();
      }, 500);
    } catch (err: unknown) {
      clearInterval(interval);
      setLoading(false);
      const msg = err instanceof Error ? err.message : 'Failed to connect to repository';
      setErrorMsg(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl">
        <GlassCard glow="cyan" className="p-7 border-cyan-500/30 shadow-2xl relative">
          
          {/* Close Button */}
          <button
            onClick={onClose}
            disabled={loading}
            className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Modal Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold font-display text-white">Connect GitHub Repository</h3>
              <p className="text-xs font-mono text-slate-400">
                Phase 1 Ingestion: Extract Metadata, Commits, Issues & Evidence
              </p>
            </div>
          </div>

          {/* Input Form */}
          {!loading ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-300 uppercase mb-2 font-semibold">
                  GitHub Repository URL
                </label>
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://github.com/owner/repository"
                    onKeyDown={(e) => e.key === 'Enter' && handleAnalyze(urlInput)}
                    className="w-full bg-[#090D16] border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>

              {/* Sample Quick Presets */}
              <div>
                <span className="text-[11px] font-mono text-slate-500 block mb-2">Sample Repositories:</span>
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setUrlInput(p.url);
                        handleAnalyze(p.url);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3 text-cyan-400" />
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Error Message Alert */}
              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Actions */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800/80">
                <Button variant="ghost" size="md" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  icon={<Sparkles className="w-4 h-4" />}
                  onClick={() => handleAnalyze(urlInput)}
                >
                  Analyze Repository
                </Button>
              </div>
            </div>
          ) : (
            /* Live Analysis Progress Stepper */
            <div className="py-6 space-y-6">
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                <div>
                  <h4 className="text-base font-bold text-white">Ingesting Repository Data...</h4>
                  <p className="text-xs font-mono text-cyan-400">{steps[currentStepIndex]}</p>
                </div>
              </div>

              {/* Stepper Progress Items */}
              <div className="space-y-2.5 font-mono text-xs">
                {steps.map((stepText, idx) => {
                  const isDone = idx < currentStepIndex;
                  const isCurrent = idx === currentStepIndex;
                  return (
                    <div
                      key={stepText}
                      className={`flex items-center justify-between p-2.5 rounded-xl transition-colors ${
                        isDone
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                          : isCurrent
                          ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-semibold'
                          : 'bg-slate-900/40 text-slate-500 border border-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : isCurrent ? (
                          <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center text-[9px] text-slate-500">
                            {idx + 1}
                          </span>
                        )}
                        <span>{stepText}</span>
                      </div>
                      {isDone && <span className="text-[10px] text-emerald-400 uppercase">DONE</span>}
                      {isCurrent && <span className="text-[10px] text-cyan-400 uppercase animate-pulse">EXTRACTING</span>}
                    </div>
                  );
                })}
              </div>

            </div>
          )}

        </GlassCard>
      </div>
    </div>
  );
};
