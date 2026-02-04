import React from 'react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export function Modal({ isOpen, onClose, title, children, footer, maxWidth = 'md' }: ModalProps) {
  if (!isOpen) return null;

  const maxWidths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 transition-opacity" 
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className={`relative w-full ${maxWidths[maxWidth]} transform overflow-hidden rounded-lg border border-slate-700 bg-slate-800 text-left shadow-xl transition-all`}>
        <div className="border-b border-slate-700 px-4 py-3 sm:px-6">
          <h3 className="text-lg font-medium leading-6 text-slate-100">{title}</h3>
        </div>
        
        <div className="px-4 py-5 sm:p-6 text-slate-300">
          {children}
        </div>

        {footer && (
          <div className="bg-slate-800/50 px-4 py-3 sm:px-6 flex justify-end gap-2 border-t border-slate-700">
            {footer}
          </div>
        )}
        
        {!footer && (
          <div className="bg-slate-800/50 px-4 py-3 sm:px-6 flex justify-end gap-2 border-t border-slate-700">
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}
