import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RotateCcw, Play, Pause } from 'lucide-react';

interface PathDef {
  id: string;
  color: string;
  glowColor: string;
  d: string;
  startDelaySec: number;
  durationSec: number;
  // Associated commit nodes along or at end of this path
  nodes: Array<{
    id: string;
    atProgress: number; // 0 to 1 along the path length
    cx?: number;
    cy?: number;
    isMerge?: boolean;
    isOrigin?: boolean;
  }>;
}

const PALETTE = {
  cyan: { color: '#22d3ee', glow: 'rgba(34, 211, 238, 0.6)' },
  green: { color: '#10b981', glow: 'rgba(16, 185, 129, 0.6)' },
  orange: { color: '#f97316', glow: 'rgba(249, 115, 22, 0.6)' },
  blue: { color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.6)' },
  magenta: { color: '#d946ef', glow: 'rgba(217, 70, 239, 0.6)' },
  violet: { color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.6)' },
};

// Precise Git-history path layout with circuit-style 90-degree rounded elbows
const PATH_DEFINITIONS: PathDef[] = [
  // 1. Vertical Main History Spine (Stage 2)
  {
    id: 'spine',
    color: PALETTE.cyan.color,
    glowColor: PALETTE.cyan.glow,
    d: 'M 120 60 L 120 420',
    startDelaySec: 0.8,
    durationSec: 1.4,
    nodes: [
      { id: 'node-origin', atProgress: 0, cx: 120, cy: 60, isOrigin: true },
      { id: 'spine-1', atProgress: 0.19, cx: 120, cy: 130 },
      { id: 'spine-2', atProgress: 0.38, cx: 120, cy: 200 },
      { id: 'spine-3', atProgress: 0.61, cx: 120, cy: 280 },
      { id: 'spine-4', atProgress: 0.81, cx: 120, cy: 350 },
      { id: 'spine-5', atProgress: 1.0, cx: 120, cy: 420 },
    ],
  },
  // 2. Branch 1 (Cyan Main Extension - Stage 3)
  {
    id: 'branch-1',
    color: PALETTE.cyan.color,
    glowColor: PALETTE.cyan.glow,
    d: 'M 120 130 L 230 130 Q 242 130 242 142 L 242 178 Q 242 190 254 190 L 460 190',
    startDelaySec: 2.2,
    durationSec: 1.3,
    nodes: [
      { id: 'b1-1', atProgress: 0.45, cx: 242, cy: 160 },
      { id: 'b1-2', atProgress: 0.72, cx: 350, cy: 190 },
      { id: 'b1-end', atProgress: 1.0, cx: 460, cy: 190 },
    ],
  },
  // 3. Branch 2 (Green Feature Branch - Stage 4 & 5)
  {
    id: 'branch-2',
    color: PALETTE.green.color,
    glowColor: PALETTE.green.glow,
    d: 'M 120 200 L 195 200 Q 207 200 207 188 L 207 112 Q 207 100 219 100 L 560 100',
    startDelaySec: 3.4,
    durationSec: 1.4,
    nodes: [
      { id: 'b2-1', atProgress: 0.52, cx: 320, cy: 100 },
      { id: 'b2-2', atProgress: 0.78, cx: 440, cy: 100 },
      { id: 'b2-end', atProgress: 1.0, cx: 560, cy: 100 },
    ],
  },
  // 4. Branch 3 (Orange Branch - Stage 4 & 5)
  {
    id: 'branch-3',
    color: PALETTE.orange.color,
    glowColor: PALETTE.orange.glow,
    d: 'M 120 280 L 175 280 Q 187 280 187 292 L 187 368 Q 187 380 199 380 L 430 380',
    startDelaySec: 4.6,
    durationSec: 1.3,
    nodes: [
      { id: 'b3-1', atProgress: 0.62, cx: 300, cy: 380 },
      { id: 'b3-end', atProgress: 1.0, cx: 430, cy: 380 },
    ],
  },
  // 5. Branch 4 (Blue Sub-Branch from Branch 1 - Stage 7)
  {
    id: 'branch-4',
    color: PALETTE.blue.color,
    glowColor: PALETTE.blue.glow,
    d: 'M 350 190 L 350 258 Q 350 270 362 270 L 600 270',
    startDelaySec: 5.8,
    durationSec: 1.3,
    nodes: [
      { id: 'b4-1', atProgress: 0.55, cx: 470, cy: 270 },
      { id: 'b4-end', atProgress: 1.0, cx: 600, cy: 270 },
    ],
  },
  // 6. Branch 5 (Magenta Sub-Branch from Branch 2 - Stage 7)
  {
    id: 'branch-5',
    color: PALETTE.magenta.color,
    glowColor: PALETTE.magenta.glow,
    d: 'M 440 100 L 440 62 Q 440 50 452 50 L 740 50',
    startDelaySec: 6.9,
    durationSec: 1.3,
    nodes: [
      { id: 'b5-1', atProgress: 0.58, cx: 590, cy: 50 },
      { id: 'b5-end', atProgress: 1.0, cx: 740, cy: 50 },
    ],
  },
  // 7. Branch 6 (Violet Sub-Branch from Branch 3 - Stage 7)
  {
    id: 'branch-6',
    color: PALETTE.violet.color,
    glowColor: PALETTE.violet.glow,
    d: 'M 430 380 L 430 428 Q 430 440 442 440 L 680 440',
    startDelaySec: 7.9,
    durationSec: 1.2,
    nodes: [
      { id: 'b6-1', atProgress: 0.56, cx: 560, cy: 440 },
      { id: 'b6-end', atProgress: 1.0, cx: 680, cy: 440 },
    ],
  },
  // 8A. Merge Path A (Green to Merge Node - Stage 8)
  {
    id: 'merge-a',
    color: PALETTE.green.color,
    glowColor: PALETTE.green.glow,
    d: 'M 560 100 L 675 100 Q 695 100 695 120 L 695 180 Q 695 190 705 190 L 720 190',
    startDelaySec: 9.0,
    durationSec: 1.4,
    nodes: [],
  },
  // 8B. Merge Path B (Blue to Merge Node - Stage 8)
  {
    id: 'merge-b',
    color: PALETTE.blue.color,
    glowColor: PALETTE.blue.glow,
    d: 'M 600 270 L 675 270 Q 695 270 695 250 L 695 200 Q 695 190 705 190 L 720 190',
    startDelaySec: 9.0,
    durationSec: 1.4,
    nodes: [{ id: 'merge-node', atProgress: 1.0, cx: 720, cy: 190, isMerge: true }],
  },
  // 9. Continuing Post-Merge Path (Cyan/Magenta - Stage 8/9)
  {
    id: 'post-merge',
    color: PALETTE.cyan.color,
    glowColor: PALETTE.cyan.glow,
    d: 'M 720 190 L 880 190',
    startDelaySec: 10.5,
    durationSec: 1.1,
    nodes: [{ id: 'final-terminal', atProgress: 1.0, cx: 880, cy: 190 }],
  },
];

const TOTAL_ANIMATION_CYCLE_SEC = 14.5;

interface ParticlePulse {
  x: number;
  y: number;
  color: string;
  opacity: number;
}

export const GitHistoryMemoryAnimation: React.FC<{ className?: string }> = ({ className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const [pathLengths, setPathLengths] = useState<Record<string, number>>({});
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isReducedMotion, setIsReducedMotion] = useState<boolean>(false);
  const startTimeRef = useRef<number | null>(null);
  const pausedTimeRef = useRef<number>(0);
  const animFrameIdRef = useRef<number | null>(null);

  // Check reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsReducedMotion(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Calculate SVG path lengths on mount / layout
  useEffect(() => {
    const lengths: Record<string, number> = {};
    PATH_DEFINITIONS.forEach((p) => {
      const el = pathRefs.current[p.id];
      if (el) {
        try {
          lengths[p.id] = el.getTotalLength();
        } catch {
          lengths[p.id] = 300;
        }
      } else {
        lengths[p.id] = 300;
      }
    });
    setPathLengths(lengths);
  }, []);

  // Main animation clock loop
  useEffect(() => {
    if (isReducedMotion) return;

    let mounted = true;

    const animate = (timestamp: number) => {
      if (!mounted) return;

      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp - pausedTimeRef.current;
      }

      if (isPlaying) {
        const elapsed = (timestamp - startTimeRef.current) / 1000;
        const cycleTime = elapsed % TOTAL_ANIMATION_CYCLE_SEC;
        setElapsedSec(cycleTime);
        pausedTimeRef.current = cycleTime * 1000;
      }

      animFrameIdRef.current = requestAnimationFrame(animate);
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    return () => {
      mounted = false;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [isPlaying, isReducedMotion]);

  const handleReset = () => {
    startTimeRef.current = null;
    pausedTimeRef.current = 0;
    setElapsedSec(0);
    setIsPlaying(true);
  };

  const handleTogglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  // Helper to compute progress (0 to 1) of a path based on current elapsedSec
  const getPathProgress = useCallback(
    (pathDef: PathDef): number => {
      if (isReducedMotion) return 1.0;
      if (elapsedSec < pathDef.startDelaySec) return 0;
      const pathElapsed = elapsedSec - pathDef.startDelaySec;
      const progress = Math.min(1.0, pathElapsed / pathDef.durationSec);
      return progress;
    },
    [elapsedSec, isReducedMotion]
  );

  // Compute active traveling pulse position along paths currently being drawn
  const activePulses: ParticlePulse[] = [];
  PATH_DEFINITIONS.forEach((pathDef) => {
    const progress = getPathProgress(pathDef);
    if (progress > 0 && progress < 1.0) {
      const el = pathRefs.current[pathDef.id];
      const totalLen = pathLengths[pathDef.id] || 300;
      if (el) {
        try {
          const pt = el.getPointAtLength(totalLen * progress);
          activePulses.push({
            x: pt.x,
            y: pt.y,
            color: pathDef.color,
            opacity: 1.0,
          });
        } catch {
          // fallback
        }
      }
    }
  });

  // Stage 1: Origin dot state
  const originVisible = isReducedMotion || elapsedSec >= 0.3;
  const originPulse = !isReducedMotion && elapsedSec >= 0.3 && elapsedSec < 1.2;

  // Final complete state check
  const isComplete = !isReducedMotion && elapsedSec >= 11.5;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[400px] rounded-2xl bg-[#05070C] border border-slate-800/90 shadow-2xl overflow-hidden flex flex-col justify-between select-none ${className}`}
    >
      {/* Subtle Control Bar Header Overlay */}
      <div className="absolute top-3 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                isComplete ? 'bg-emerald-400 opacity-75' : 'bg-cyan-400 opacity-75'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isComplete ? 'bg-emerald-500' : 'bg-cyan-500'
              }`}
            />
          </span>
          <span className="text-[11px] font-mono tracking-wider font-bold uppercase text-slate-300">
            {isComplete ? 'ENGINEERING MEMORY ACTIVE' : 'RECONSTRUCTING GIT HISTORY...'}
          </span>
        </div>

        {!isReducedMotion && (
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={handleTogglePlay}
              title={isPlaying ? 'Pause Animation' : 'Play Animation'}
              className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-cyan-500/50 text-slate-400 hover:text-white transition-colors"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-cyan-400" />}
            </button>
            <button
              onClick={handleReset}
              title="Replay Construction Animation"
              className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-cyan-500/50 text-slate-400 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* SVG Canvas for Engineering History Visualization */}
      <svg
        className="w-full h-full"
        viewBox="0 0 960 480"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Subtle Fine Engineering Grid Pattern */}
          <pattern
            id="eng-grid"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              stroke="rgba(255, 255, 255, 0.03)"
              strokeWidth="1"
            />
            <circle cx="0" cy="0" r="0.75" fill="rgba(34, 211, 238, 0.15)" />
          </pattern>

          {/* SVG Glow Filters for Paths & Nodes */}
          <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-orange" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-magenta" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-violet" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Pulse Core Glow Filter */}
          <filter id="pulse-bloom" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. Engineering Grid Background */}
        <rect width="960" height="480" fill="url(#eng-grid)" />

        {/* Subtle Ambient Radial Background Gradient */}
        <radialGradient id="center-glow" cx="40%" cy="50%" r="60%">
          <stop offset="0%" stopColor="rgba(34, 211, 238, 0.04)" />
          <stop offset="100%" stopColor="rgba(5, 7, 12, 0)" />
        </radialGradient>
        <rect width="960" height="480" fill="url(#center-glow)" />

        {/* 2. Render Branch & History Paths */}
        {PATH_DEFINITIONS.map((pathDef) => {
          const progress = getPathProgress(pathDef);
          const totalLen = pathLengths[pathDef.id] || 300;
          const strokeDashoffset = totalLen * (1 - progress);

          if (progress <= 0) return null;

          return (
            <g key={pathDef.id}>
              {/* Background ambient path glow */}
              <path
                d={pathDef.d}
                fill="none"
                stroke={pathDef.glowColor}
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isComplete ? 0.35 : 0.45}
                style={{
                  strokeDasharray: totalLen,
                  strokeDashoffset: strokeDashoffset,
                  transition: isReducedMotion ? 'none' : 'stroke-dashoffset 0.05s linear',
                }}
              />
              {/* Primary sharp stroke */}
              <path
                ref={(el) => {
                  pathRefs.current[pathDef.id] = el;
                }}
                d={pathDef.d}
                fill="none"
                stroke={pathDef.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: totalLen,
                  strokeDashoffset: strokeDashoffset,
                  transition: isReducedMotion ? 'none' : 'stroke-dashoffset 0.05s linear',
                }}
              />
            </g>
          );
        })}

        {/* 3. Render Commit & Terminal Nodes */}
        {PATH_DEFINITIONS.map((pathDef) => {
          const pathProgress = getPathProgress(pathDef);

          return pathDef.nodes.map((node) => {
            const isNodeVisible = isReducedMotion || pathProgress >= node.atProgress;
            if (!isNodeVisible || node.cx === undefined || node.cy === undefined) return null;

            const isJustAppeared =
              !isReducedMotion &&
              pathProgress >= node.atProgress &&
              pathProgress < node.atProgress + 0.15;

            if (node.isOrigin) {
              if (!originVisible) return null;
              return (
                <g key={node.id} transform={`translate(${node.cx}, ${node.cy})`}>
                  {originPulse && (
                    <circle
                      r="16"
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="1.5"
                      opacity="0.6"
                      className="animate-ping"
                    />
                  )}
                  <circle r="8" fill="rgba(34, 211, 238, 0.25)" />
                  <circle r="4.5" fill="#22d3ee" filter="url(#glow-cyan)" />
                  <circle r="2" fill="#ffffff" />
                </g>
              );
            }

            if (node.isMerge) {
              return (
                <g key={node.id} transform={`translate(${node.cx}, ${node.cy})`}>
                  {/* Outer Merge Ring */}
                  <circle
                    r="12"
                    fill="rgba(34, 211, 238, 0.15)"
                    stroke="#22d3ee"
                    strokeWidth="1.5"
                    filter="url(#glow-cyan)"
                  />
                  <circle
                    r="7"
                    fill="rgba(217, 70, 239, 0.3)"
                    stroke="#d946ef"
                    strokeWidth="1.5"
                  />
                  <circle r="3" fill="#ffffff" />
                </g>
              );
            }

            return (
              <g key={node.id} transform={`translate(${node.cx}, ${node.cy})`}>
                {/* Node halo / burst on appearance */}
                {isJustAppeared && (
                  <circle
                    r="10"
                    fill="none"
                    stroke={pathDef.color}
                    strokeWidth="1"
                    opacity="0.8"
                  />
                )}
                {/* Outer halo */}
                <circle r="5" fill={pathDef.glowColor} />
                {/* Inner bright commit dot */}
                <circle r="3" fill={pathDef.color} />
                {/* Core light */}
                <circle r="1.2" fill="#ffffff" />
              </g>
            );
          });
        })}

        {/* 4. Render Active Flowing Light Pulses (Stage 6) */}
        {!isReducedMotion &&
          activePulses.map((pulse, idx) => (
            <g key={idx} transform={`translate(${pulse.x}, ${pulse.y})`}>
              {/* Outer Bloom */}
              <circle
                r="10"
                fill={pulse.color}
                opacity="0.35"
                filter="url(#pulse-bloom)"
              />
              {/* Core traveling particle */}
              <circle r="4.5" fill="#ffffff" filter="url(#pulse-bloom)" />
              <circle r="2.5" fill={pulse.color} />
            </g>
          ))}
      </svg>

      {/* Footer Legend / Branding Overlay */}
      <div className="absolute bottom-3 left-4 right-4 z-20 flex items-center justify-between text-[11px] font-mono text-slate-400 pointer-events-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block shadow-[0_0_8px_#22d3ee]" />
            <span>Spine</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-[0_0_8px_#10b981]" />
            <span>Feature</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-400 inline-block shadow-[0_0_8px_#c084fc]" />
            <span>Merge</span>
          </div>
        </div>

        <div className="text-[10px] text-slate-500 font-bold tracking-wider">
          GIT HISTORY → ENGINEERING MEMORY
        </div>
      </div>
    </div>
  );
};
