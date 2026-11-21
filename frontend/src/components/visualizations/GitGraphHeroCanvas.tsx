import React, { useEffect, useRef } from 'react';

interface GitLaneNode {
  ratio: number; // 0..1 along path
  label?: string;
  sublabel?: string;
  type: 'commit' | 'branch' | 'merge' | 'decision' | 'incident';
  radius: number;
}

interface GitLanePath {
  id: string;
  stream: 'left' | 'right';
  color: string;
  glowColor: string;
  width: number;
  waypoints: { xRatio: number; yRatio: number }[];
  nodes: GitLaneNode[];
  delay: number; // 0..0.4 start delay factor
}

interface TravellingPulse {
  laneIndex: number;
  progress: number;
  speed: number;
  color: string;
  size: number;
}

export interface GitGraphHeroCanvasProps {
  className?: string;
  onAnimationComplete?: () => void;
}

export const GitGraphHeroCanvas: React.FC<GitGraphHeroCanvasProps> = ({
  className = '',
  onAnimationComplete
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });
  const onAnimationCompleteRef = useRef(onAnimationComplete);

  useEffect(() => {
    onAnimationCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = container.clientWidth;
    let height = container.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      if (!container || !canvas) return;
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Defined Dual-Stream GitGraph Lanes (Left -> Center & Right -> Center)
    const lanes: GitLanePath[] = [
      // ==========================================
      // LEFT STREAM (Flows Left -> Right toward Center)
      // ==========================================
      {
        id: 'left-main-trunk',
        stream: 'left',
        color: '#38BDF8', // Cyan / Sky
        glowColor: 'rgba(56, 189, 248, 0.65)',
        width: 2.8,
        delay: 0.0,
        waypoints: [
          { xRatio: -0.05, yRatio: 0.24 },
          { xRatio: 0.10, yRatio: 0.24 },
          { xRatio: 0.16, yRatio: 0.34 },
          { xRatio: 0.21, yRatio: 0.34 },
          { xRatio: 0.24, yRatio: 0.40 } // Curves toward center focus (shortened)
        ],
        nodes: [
          { ratio: 0.15, type: 'commit', label: 'root: 0x8f1a', radius: 5 },
          { ratio: 0.45, type: 'decision', label: 'ARCH DECISION', sublabel: 'Graph Engine v2', radius: 6 },
          { ratio: 0.75, type: 'commit', label: 'v1.4.0', radius: 5 },
          { ratio: 0.98, type: 'merge', label: 'REASONING STREAM', radius: 6 }
        ]
      },
      {
        id: 'left-branch-ast',
        stream: 'left',
        color: '#A855F7', // Purple
        glowColor: 'rgba(168, 85, 247, 0.6)',
        width: 2.2,
        delay: 0.15,
        waypoints: [
          { xRatio: 0.10, yRatio: 0.24 }, // Fork from main
          { xRatio: 0.15, yRatio: 0.15 },
          { xRatio: 0.19, yRatio: 0.15 },
          { xRatio: 0.22, yRatio: 0.26 }  // Merge back (shortened)
        ],
        nodes: [
          { ratio: 0.30, type: 'branch', label: 'feat/ast-parser', radius: 4.5 },
          { ratio: 0.65, type: 'commit', label: 'commit: e4b72f', radius: 4 },
          { ratio: 0.95, type: 'merge', label: 'PR #142 Merged', radius: 5 }
        ]
      },
      {
        id: 'left-branch-memory',
        stream: 'left',
        color: '#06B6D4', // Darker Cyan
        glowColor: 'rgba(6, 182, 212, 0.6)',
        width: 2.0,
        delay: 0.20,
        waypoints: [
          { xRatio: 0.16, yRatio: 0.34 }, // Fork from main
          { xRatio: 0.20, yRatio: 0.52 },
          { xRatio: 0.23, yRatio: 0.52 },
          { xRatio: 0.25, yRatio: 0.46 }  // Shortened endpoint
        ],
        nodes: [
          { ratio: 0.25, type: 'branch', label: 'feat/memory-index', radius: 4.5 },
          { ratio: 0.60, type: 'commit', label: 'node linking', radius: 4 },
          { ratio: 0.92, type: 'commit', label: 'verified: 99.2%', radius: 4.5 }
        ]
      },
      {
        id: 'left-lower-history',
        stream: 'left',
        color: '#3B82F6', // Electric Blue
        glowColor: 'rgba(59, 130, 246, 0.55)',
        width: 1.8,
        delay: 0.28,
        waypoints: [
          { xRatio: -0.05, yRatio: 0.68 },
          { xRatio: 0.10, yRatio: 0.68 },
          { xRatio: 0.16, yRatio: 0.60 },
          { xRatio: 0.21, yRatio: 0.60 },
          { xRatio: 0.24, yRatio: 0.52 }  // Shortened endpoint
        ],
        nodes: [
          { ratio: 0.20, type: 'commit', label: 'refactor: legacy-bridge', radius: 4 },
          { ratio: 0.65, type: 'commit', label: 'commit: 7c32b1', radius: 4 }
        ]
      },

      // ==========================================
      // RIGHT STREAM (Flows Right -> Left toward Center)
      // ==========================================
      {
        id: 'right-main-trunk',
        stream: 'right',
        color: '#38BDF8', // Cyan / Sky
        glowColor: 'rgba(56, 189, 248, 0.65)',
        width: 2.8,
        delay: 0.0,
        waypoints: [
          { xRatio: 1.05, yRatio: 0.26 },
          { xRatio: 0.90, yRatio: 0.26 },
          { xRatio: 0.84, yRatio: 0.36 },
          { xRatio: 0.79, yRatio: 0.36 },
          { xRatio: 0.76, yRatio: 0.40 } // Curves toward center focus (shortened)
        ],
        nodes: [
          { ratio: 0.15, type: 'commit', label: 'v2.4.0-rc', radius: 5 },
          { ratio: 0.48, type: 'decision', label: 'CONTEXT SYNTHESIS', radius: 6 },
          { ratio: 0.78, type: 'commit', label: 'commit: 91a4c8', radius: 5 },
          { ratio: 0.98, type: 'merge', label: 'MEMORY STREAM', radius: 6 }
        ]
      },
      {
        id: 'right-branch-events',
        stream: 'right',
        color: '#C084FC', // Bright Purple
        glowColor: 'rgba(192, 132, 252, 0.6)',
        width: 2.2,
        delay: 0.15,
        waypoints: [
          { xRatio: 0.90, yRatio: 0.26 }, // Fork
          { xRatio: 0.85, yRatio: 0.16 },
          { xRatio: 0.81, yRatio: 0.16 },
          { xRatio: 0.78, yRatio: 0.28 }  // Merge back (shortened)
        ],
        nodes: [
          { ratio: 0.30, type: 'branch', label: 'feat/event-bus', radius: 4.5 },
          { ratio: 0.65, type: 'commit', label: 'async dispatch', radius: 4 },
          { ratio: 0.95, type: 'merge', label: 'PR #189 Merged', radius: 5 }
        ]
      },
      {
        id: 'right-branch-incidents',
        stream: 'right',
        color: '#F97316', // Warm Orange
        glowColor: 'rgba(249, 115, 22, 0.65)',
        width: 2.0,
        delay: 0.22,
        waypoints: [
          { xRatio: 0.84, yRatio: 0.36 }, // Fork
          { xRatio: 0.80, yRatio: 0.54 },
          { xRatio: 0.77, yRatio: 0.54 },
          { xRatio: 0.75, yRatio: 0.46 }  // Shortened endpoint
        ],
        nodes: [
          { ratio: 0.28, type: 'incident', label: 'DEBT ALERT #18', sublabel: 'Unresolved edge', radius: 5.5 },
          { ratio: 0.65, type: 'commit', label: 'fix: cache-leak', radius: 4 },
          { ratio: 0.92, type: 'commit', label: 'resolved', radius: 4.5 }
        ]
      },
      {
        id: 'right-lower-history',
        stream: 'right',
        color: '#3B82F6', // Electric Blue
        glowColor: 'rgba(59, 130, 246, 0.55)',
        width: 1.8,
        delay: 0.30,
        waypoints: [
          { xRatio: 1.05, yRatio: 0.70 },
          { xRatio: 0.90, yRatio: 0.70 },
          { xRatio: 0.84, yRatio: 0.62 },
          { xRatio: 0.79, yRatio: 0.62 },
          { xRatio: 0.76, yRatio: 0.52 }  // Shortened endpoint
        ],
        nodes: [
          { ratio: 0.22, type: 'commit', label: 'build: rust-core', radius: 4 },
          { ratio: 0.70, type: 'commit', label: 'tree-walk optimization', radius: 4 }
        ]
      }
    ];

    // Travelling pulses along lanes
    const pulses: TravellingPulse[] = [
      { laneIndex: 0, progress: 0.1, speed: 0.0022, color: '#FFFFFF', size: 3 },
      { laneIndex: 1, progress: 0.4, speed: 0.0025, color: '#F3E8FF', size: 2.5 },
      { laneIndex: 2, progress: 0.2, speed: 0.0020, color: '#E0F2FE', size: 2.5 },
      { laneIndex: 3, progress: 0.6, speed: 0.0018, color: '#93C5FD', size: 2.2 },
      { laneIndex: 4, progress: 0.15, speed: 0.0022, color: '#FFFFFF', size: 3 },
      { laneIndex: 5, progress: 0.35, speed: 0.0024, color: '#F3E8FF', size: 2.5 },
      { laneIndex: 6, progress: 0.5, speed: 0.0021, color: '#FFEDD5', size: 2.5 },
      { laneIndex: 7, progress: 0.7, speed: 0.0019, color: '#93C5FD', size: 2.2 }
    ];

    const startTime = performance.now();
    const BUILD_DURATION_MS = prefersReducedMotion ? 0 : 3400; // 3.4s progressive build
    let hasTriggeredComplete = false;

    // Proportional horizontal adjustment for smaller viewports (< 1280px) to prevent lines from overlapping central text
    const getResponsiveX = (rawX: number, stream: 'left' | 'right') => {
      if (width >= 1280) return rawX;
      const scale = Math.max(0.60, Math.min(1, (width - 320) / (1280 - 320)));
      if (stream === 'left') {
        return -0.05 + (rawX - (-0.05)) * scale;
      } else {
        return 1.05 - (1.05 - rawX) * scale;
      }
    };

    // Interpolate points along GitGraph waypoints using stepped Bezier corners
    const getPointOnLane = (
      waypoints: { xRatio: number; yRatio: number }[],
      pathRatio: number,
      stream: 'left' | 'right'
    ) => {
      if (waypoints.length === 0) return { x: 0, y: 0 };
      if (waypoints.length === 1 || pathRatio <= 0) {
        const x = getResponsiveX(waypoints[0].xRatio, stream);
        return { x: x * width, y: waypoints[0].yRatio * height };
      }
      if (pathRatio >= 1) {
        const last = waypoints[waypoints.length - 1];
        const x = getResponsiveX(last.xRatio, stream);
        return { x: x * width, y: last.yRatio * height };
      }

      const totalSegments = waypoints.length - 1;
      const scaledRatio = pathRatio * totalSegments;
      const segIndex = Math.floor(scaledRatio);
      const t = scaledRatio - segIndex;

      const p1 = waypoints[segIndex];
      const p2 = waypoints[segIndex + 1];

      const p1X = getResponsiveX(p1.xRatio, stream);
      const p2X = getResponsiveX(p2.xRatio, stream);

      // GitGraph orthogonal / smooth bezier corner step transition
      const midX = (p1X + p2X) / 2;

      // Cubic bezier control points creating authentic GitGraph branch curves
      const cp1x = midX;
      const cp1y = p1.yRatio;
      const cp2x = midX;
      const cp2y = p2.yRatio;

      // Cubic bezier evaluation: B(t) = (1-t)^3 p1 + 3(1-t)^2 t cp1 + 3(1-t) t^2 cp2 + t^3 p2
      const invT = 1 - t;
      const invT2 = invT * invT;
      const invT3 = invT2 * invT;
      const t2 = t * t;
      const t3 = t2 * t;

      const xRatio = invT3 * p1X + 3 * invT2 * t * cp1x + 3 * invT * t2 * cp2x + t3 * p2X;
      const yRatio = invT3 * p1.yRatio + 3 * invT2 * t * cp1y + 3 * invT * t2 * cp2y + t3 * p2.yRatio;

      return { x: xRatio * width, y: yRatio * height };
    };

    const render = (now: number) => {
      const elapsed = now - startTime;
      const rawProgress = prefersReducedMotion ? 1 : Math.min(1, elapsed / BUILD_DURATION_MS);
      // Cubic ease-out
      const progress = 1 - Math.pow(1 - rawProgress, 3);
      const idleTime = Math.max(0, elapsed - BUILD_DURATION_MS) * 0.001;

      // Synchronize completion callback once all branches have finished drawing
      const allLanesComplete = prefersReducedMotion || lanes.every((lane) => {
        const laneProgress = (progress - lane.delay) / (1 - lane.delay || 1);
        return laneProgress >= 1;
      });

      if (allLanesComplete && !hasTriggeredComplete) {
        hasTriggeredComplete = true;
        if (onAnimationCompleteRef.current) {
          onAnimationCompleteRef.current();
        }
      }

      ctx.clearRect(0, 0, width, height);
      const mouse = mouseRef.current;

      // 1. Central Ambient Glow Energy (Triggers when Left & Right streams converge at center)
      // Max intensity occurs as paths reach the center margin (~xRatio 0.24 - 0.76)
      const glowIntensity = Math.min(1, progress * 1.2) * (0.75 + Math.sin(idleTime * 1.8) * 0.08);
      const centerX = width * 0.5;
      const centerY = height * 0.42;
      const glowRadius = Math.min(width, height) * 0.36;

      const radialGlow = ctx.createRadialGradient(
        centerX, centerY, 5,
        centerX, centerY, glowRadius
      );
      radialGlow.addColorStop(0.0, `rgba(56, 189, 248, ${0.30 * glowIntensity})`);
      radialGlow.addColorStop(0.32, `rgba(168, 85, 247, ${0.18 * glowIntensity})`);
      radialGlow.addColorStop(0.68, `rgba(6, 182, 212, ${0.05 * glowIntensity})`);
      radialGlow.addColorStop(1.0, 'rgba(5, 7, 12, 0)');

      ctx.fillStyle = radialGlow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Render Left & Right GitGraph Lanes
      lanes.forEach((lane) => {
        const laneProgress = Math.max(0, Math.min(1, (progress - lane.delay) / (1 - lane.delay || 1)));
        if (laneProgress <= 0) return;

        const stepCount = 50;
        const currentSteps = Math.floor(stepCount * laneProgress);
        if (currentSteps < 2) return;

        // Outer Glow Path
        ctx.save();
        ctx.strokeStyle = lane.glowColor;
        ctx.lineWidth = lane.width * 2.8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = lane.color;
        ctx.shadowBlur = 10 * laneProgress;
        ctx.globalAlpha = 0.75 * laneProgress;

        ctx.beginPath();
        for (let i = 0; i <= currentSteps; i++) {
          const r = i / stepCount;
          const pt = getPointOnLane(lane.waypoints, r, lane.stream);
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        ctx.restore();

        // Core Sharp Path
        ctx.save();
        ctx.strokeStyle = lane.color;
        ctx.lineWidth = lane.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.95 * laneProgress;

        ctx.beginPath();
        for (let i = 0; i <= currentSteps; i++) {
          const r = i / stepCount;
          const pt = getPointOnLane(lane.waypoints, r, lane.stream);
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        ctx.restore();

        // Leading Edge Pulse / Swipe Tip
        if (laneProgress < 1.0) {
          const tipPt = getPointOnLane(lane.waypoints, laneProgress, lane.stream);
          ctx.save();
          ctx.fillStyle = '#FFFFFF';
          ctx.shadowColor = lane.color;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(tipPt.x, tipPt.y, lane.width * 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // 3. Render Commit Nodes along Lane
        lane.nodes.forEach((node) => {
          if (laneProgress >= node.ratio) {
            let pt = getPointOnLane(lane.waypoints, node.ratio, lane.stream);

            // Subtle magnetic cursor offset
            if (mouse.active) {
              const mdx = mouse.x - pt.x;
              const mdy = mouse.y - pt.y;
              const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
              if (mdist < 120 && mdist > 2) {
                const force = ((120 - mdist) / 120) * 6;
                pt = { x: pt.x - (mdx / mdist) * force, y: pt.y - (mdy / mdist) * force };
              }
            }

            const nodeAge = (laneProgress - node.ratio) / (1 - node.ratio || 1);
            const scalePop = Math.min(1, nodeAge * 4);
            const baseRadius = node.radius * scalePop;

            ctx.save();

            let nodeColor = '#38BDF8';
            let glowColor = 'rgba(56, 189, 248, 0.8)';
            if (node.type === 'decision') {
              nodeColor = '#A855F7';
              glowColor = 'rgba(168, 85, 247, 0.85)';
            } else if (node.type === 'incident') {
              nodeColor = '#EF4444';
              glowColor = 'rgba(239, 68, 68, 0.85)';
            } else if (node.type === 'merge') {
              nodeColor = '#10B981';
              glowColor = 'rgba(16, 185, 129, 0.85)';
            } else if (node.type === 'branch') {
              nodeColor = '#EC4899';
              glowColor = 'rgba(236, 72, 153, 0.85)';
            }

            // Outer ring
            ctx.strokeStyle = nodeColor;
            ctx.lineWidth = 1.5;
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 10 + Math.sin(idleTime * 3 + node.ratio * 10) * 4;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, baseRadius + 3.5, 0, Math.PI * 2);
            ctx.stroke();

            // Inner solid body
            ctx.fillStyle = nodeColor;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, baseRadius, 0, Math.PI * 2);
            ctx.fill();

            // Core bright center
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, baseRadius * 0.38, 0, Math.PI * 2);
            ctx.fill();

            // Monospace labels
            if (node.label && (width >= 640 || node.type === 'decision' || node.type === 'incident')) {
              ctx.font = '500 10px "Fira Code", monospace';
              ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
              ctx.textAlign = lane.stream === 'left' ? 'right' : 'left';
              const textX = pt.x + (lane.stream === 'left' ? -(baseRadius + 8) : baseRadius + 8);
              ctx.fillText(node.label, textX, pt.y + 3);

              if (node.sublabel) {
                ctx.font = '400 8.5px "Fira Code", monospace';
                ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
                ctx.fillText(node.sublabel, textX, pt.y + 14);
              }
            }

            ctx.restore();
          }
        });
      });

      // 4. Travelling Data Pulses (Stream Inward Flow)
      if (progress > 0.25) {
        pulses.forEach((pulse) => {
          const lane = lanes[pulse.laneIndex];
          if (!lane) return;

          pulse.progress += pulse.speed;
          if (pulse.progress > 1) pulse.progress = 0;

          const pt = getPointOnLane(lane.waypoints, pulse.progress, lane.stream);
          ctx.save();
          ctx.fillStyle = pulse.color;
          ctx.shadowColor = lane.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pulse.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className={`absolute inset-0 overflow-hidden pointer-events-auto ${className}`}>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};
