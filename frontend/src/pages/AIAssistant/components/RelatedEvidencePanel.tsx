import React, { useState } from 'react';
import {
  GitCommit,
  GitPullRequest,
  AlertCircle,
  FileCode,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info
} from 'lucide-react';
import { GroupedEvidence } from '../../../types/aiAssistant';

interface RelatedEvidencePanelProps {
  evidence: GroupedEvidence;
  onSelectEvidenceItem?: (item: any) => void;
}

export const RelatedEvidencePanel: React.FC<RelatedEvidencePanelProps> = ({
  evidence,
  onSelectEvidenceItem
}) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    commits: true,
    pullRequests: true,
    issues: false,
    files: false,
    records: true
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const totalCount =
    evidence.commits.length +
    evidence.pullRequests.length +
    evidence.issues.length +
    evidence.files.length +
    evidence.evidenceRecords.length;

  return (
    <div className="p-4 rounded-2xl bg-[#0A0E1A]/95 border border-slate-800 shadow-xl space-y-3 font-mono text-xs select-none">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <h3 className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Related Evidence</span>
        </h3>
        <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800 font-bold">
          {totalCount} Total
        </span>
      </div>

      {totalCount === 0 ? (
        <div className="py-6 text-center text-slate-500 font-sans text-xs">
          No supporting evidence available for this investigation.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Section 1: Commits */}
          {evidence.commits.length > 0 && (
            <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/40">
              <button
                onClick={() => toggleSection('commits')}
                className="w-full px-3 py-2 flex items-center justify-between bg-slate-900/80 hover:bg-slate-900 text-slate-300 font-semibold text-xs cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2 text-cyan-400">
                  <GitCommit className="w-3.5 h-3.5" />
                  <span>Commits ({evidence.commits.length})</span>
                </div>
                {openSections.commits ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>

              {openSections.commits && (
                <div className="p-2 space-y-1.5 max-h-48 overflow-y-auto">
                  {evidence.commits.map((commit, idx) => (
                    <div
                      key={commit.id || idx}
                      onClick={() => onSelectEvidenceItem && onSelectEvidenceItem(commit)}
                      className="p-2 rounded-lg bg-slate-950/60 hover:bg-slate-900 border border-slate-800/60 flex items-start justify-between gap-2 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {commit.shortHash && (
                            <span className="text-[10px] text-cyan-400 font-bold">
                              {commit.shortHash}
                            </span>
                          )}
                          {commit.authorName && (
                            <span className="text-[10px] text-slate-500 truncate">
                              by {commit.authorName}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-300 font-sans truncate mt-0.5" title={commit.message}>
                          {commit.message}
                        </p>
                      </div>
                      {commit.url && (
                        <a
                          href={commit.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-500 hover:text-cyan-400 transition-colors p-1"
                          title="Open commit on GitHub"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section 2: Pull Requests */}
          {evidence.pullRequests.length > 0 && (
            <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/40">
              <button
                onClick={() => toggleSection('pullRequests')}
                className="w-full px-3 py-2 flex items-center justify-between bg-slate-900/80 hover:bg-slate-900 text-slate-300 font-semibold text-xs cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2 text-purple-400">
                  <GitPullRequest className="w-3.5 h-3.5" />
                  <span>Pull Requests ({evidence.pullRequests.length})</span>
                </div>
                {openSections.pullRequests ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>

              {openSections.pullRequests && (
                <div className="p-2 space-y-1.5 max-h-48 overflow-y-auto">
                  {evidence.pullRequests.map((pr, idx) => (
                    <div
                      key={pr.id || idx}
                      onClick={() => onSelectEvidenceItem && onSelectEvidenceItem(pr)}
                      className="p-2 rounded-lg bg-slate-950/60 hover:bg-slate-900 border border-slate-800/60 flex items-start justify-between gap-2 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <span className="text-[10px] text-purple-400 font-bold block">
                          PR #{pr.number} {pr.state && `(${pr.state})`}
                        </span>
                        <p className="text-[11px] text-slate-300 font-sans truncate mt-0.5" title={pr.title}>
                          {pr.title}
                        </p>
                      </div>
                      {pr.url && (
                        <a
                          href={pr.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-500 hover:text-purple-400 transition-colors p-1"
                          title="Open PR on GitHub"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section 3: Issues */}
          {evidence.issues.length > 0 && (
            <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/40">
              <button
                onClick={() => toggleSection('issues')}
                className="w-full px-3 py-2 flex items-center justify-between bg-slate-900/80 hover:bg-slate-900 text-slate-300 font-semibold text-xs cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2 text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Issues ({evidence.issues.length})</span>
                </div>
                {openSections.issues ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>

              {openSections.issues && (
                <div className="p-2 space-y-1.5 max-h-48 overflow-y-auto">
                  {evidence.issues.map((issue, idx) => (
                    <div
                      key={issue.id || idx}
                      onClick={() => onSelectEvidenceItem && onSelectEvidenceItem(issue)}
                      className="p-2 rounded-lg bg-slate-950/60 hover:bg-slate-900 border border-slate-800/60 flex items-start justify-between gap-2 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <span className="text-[10px] text-amber-400 font-bold block">
                          Issue #{issue.number} {issue.state && `(${issue.state})`}
                        </span>
                        <p className="text-[11px] text-slate-300 font-sans truncate mt-0.5" title={issue.title}>
                          {issue.title}
                        </p>
                      </div>
                      {issue.url && (
                        <a
                          href={issue.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-500 hover:text-amber-400 transition-colors p-1"
                          title="Open Issue on GitHub"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section 4: Evidence Records */}
          {evidence.evidenceRecords.length > 0 && (
            <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/40">
              <button
                onClick={() => toggleSection('records')}
                className="w-full px-3 py-2 flex items-center justify-between bg-slate-900/80 hover:bg-slate-900 text-slate-300 font-semibold text-xs cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Graph Evidence Records ({evidence.evidenceRecords.length})</span>
                </div>
                {openSections.records ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>

              {openSections.records && (
                <div className="p-2 space-y-1.5 max-h-56 overflow-y-auto">
                  {evidence.evidenceRecords.map((rec, idx) => (
                    <div
                      key={rec.id || idx}
                      onClick={() => onSelectEvidenceItem && onSelectEvidenceItem(rec)}
                      className="p-2 rounded-lg bg-slate-950/60 hover:bg-slate-900 border border-slate-800/60 transition-colors cursor-pointer space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-300 truncate">
                          {rec.title}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                          rec.classification === 'FACT'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : rec.classification === 'INFERENCE'
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            : 'bg-slate-800 text-rose-300 border-rose-500/30'
                        }`}>
                          {rec.classification}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-sans line-clamp-2">
                        {rec.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section 5: Files */}
          {evidence.files.length > 0 && (
            <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/40">
              <button
                onClick={() => toggleSection('files')}
                className="w-full px-3 py-2 flex items-center justify-between bg-slate-900/80 hover:bg-slate-900 text-slate-300 font-semibold text-xs cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2 text-cyan-400">
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Files ({evidence.files.length})</span>
                </div>
                {openSections.files ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>

              {openSections.files && (
                <div className="p-2 space-y-1 max-h-40 overflow-y-auto">
                  {evidence.files.map((file, idx) => (
                    <div
                      key={file.path || idx}
                      className="px-2 py-1 rounded bg-slate-950/60 text-[10px] text-slate-300 font-mono truncate"
                      title={file.path}
                    >
                      {file.path}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

