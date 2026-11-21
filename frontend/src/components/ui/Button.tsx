import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-all duration-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

  const sizes = {
    sm: 'px-3 py-1.5 text-xs font-mono gap-1.5',
    md: 'px-5 py-2.5 text-sm gap-2',
    lg: 'px-7 py-3.5 text-base gap-2.5 font-semibold'
  };

  const variants = {
    primary:
      'bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/35 hover:scale-[1.02] active:scale-[0.98]',
    secondary:
      'bg-slate-900/90 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 hover:bg-slate-800 hover:text-white hover:shadow-md hover:shadow-cyan-500/10',
    outline:
      'bg-transparent text-slate-300 border border-slate-700 hover:border-slate-500 hover:text-white hover:bg-slate-800/40',
    ghost:
      'bg-transparent text-slate-400 hover:text-white hover:bg-slate-800/50',
    glass:
      'glass-panel text-slate-100 hover:border-cyan-500/40 hover:bg-slate-800/80 shadow-xl'
  };

  return (
    <button
      className={twMerge(clsx(baseStyles, sizes[size], variants[variant], className))}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};
