import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'cyan' | 'purple' | 'emerald' | 'amber' | 'rose' | 'slate' | 'indigo' | 'blue';
  icon?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'cyan',
  icon,
  className
}) => {
  const variants = {
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/25'
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border uppercase tracking-wider',
          variants[variant],
          className
        )
      )}
    >
      {icon && <span className="shrink-0 text-[10px]">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
