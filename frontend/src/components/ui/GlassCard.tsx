import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glow?: 'cyan' | 'purple' | 'amber' | 'emerald' | 'rose' | 'none';
  hoverable?: boolean;
  /** Legacy variant prop — maps 'glow' to a cyan glow effect, others are accepted but ignored */
  variant?: 'glow' | 'default' | 'flat';
  /** Legacy padding prop — controls internal padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  glow = 'none',
  hoverable = true,
  variant,
  padding,
  className,
  ...props
}) => {
  const glowStyles = {
    none: '',
    cyan: 'hover:border-cyan-500/40 hover:shadow-cyan-500/10',
    purple: 'hover:border-purple-500/40 hover:shadow-purple-500/10',
    amber: 'hover:border-amber-500/40 hover:shadow-amber-500/10',
    emerald: 'hover:border-emerald-500/40 hover:shadow-emerald-500/10',
    rose: 'hover:border-rose-500/40 hover:shadow-rose-500/10'
  };

  // Map padding prop to Tailwind padding classes
  const paddingStyles: Record<string, string> = {
    none: '!p-0',
    sm: '!p-3',
    md: '!p-5',
    lg: '!p-7',
    xl: '!p-10'
  };

  // Map variant='glow' to a subtle cyan glow enhancement
  const variantGlow = variant === 'glow' ? 'hover:border-cyan-500/30' : '';

  return (
    <div
      className={twMerge(
        clsx(
          'glass-panel rounded-2xl p-6 transition-all duration-300 relative overflow-hidden',
          hoverable && 'glass-panel-hover hover:-translate-y-0.5',
          glowStyles[glow],
          variantGlow,
          padding && paddingStyles[padding],
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
};
