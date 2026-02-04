import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'outline';
}

export function Badge({ className = '', variant = 'default', children, ...props }: BadgeProps) {
  const variants = {
    default: "border-transparent bg-slate-700 text-slate-100 hover:bg-slate-600",
    success: "border-transparent bg-green-500/15 text-green-400 hover:bg-green-500/25",
    warning: "border-transparent bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25",
    error: "border-transparent bg-red-500/15 text-red-400 hover:bg-red-500/25",
    outline: "text-slate-400 border-slate-700 hover:bg-slate-800"
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${variants[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
}
