import React from 'react';

interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function Card({ className = '', title, description, actions, children, ...props }: CardProps) {
  return (
    <div className={`rounded-lg border border-slate-700 bg-slate-800/50 shadow-sm ${className}`} {...props}>
      {(title || description || actions) && (
        <div className="flex flex-col space-y-1.5 p-6 pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              {title && <h3 className="font-semibold leading-none tracking-tight text-slate-100">{title}</h3>}
              {description && <p className="text-sm text-slate-400">{description}</p>}
            </div>
            {actions && <div>{actions}</div>}
          </div>
        </div>
      )}
      <div className="p-6 pt-0 text-slate-300">
        {children}
      </div>
    </div>
  );
}
