import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, children, maxWidth = 'max-w-[395px]' }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-3.5 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300" 
        onClick={onClose} 
      />

      {/* Modal Dialog Shell */}
      <div className={`relative w-[95%] ${maxWidth || 'max-w-md'} max-h-[90vh] flex flex-col bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-300 z-10 my-auto text-slate-900 mx-auto`}>
        {children}
      </div>
    </div>
  );
}

Modal.Header = function ModalHeader({ title, subtitle, icon: Icon, onClose, children }) {
  return (
    <div className="flex items-start justify-between p-3 sm:p-3.5 border-b border-slate-100 bg-slate-50/95 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0 pr-2">
        {Icon && (
          <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-xs sm:text-sm font-bold font-heading text-slate-900 truncate">{title}</h3>
          {subtitle && <p className="text-[10.5px] sm:text-xs text-slate-500 mt-0.5 line-clamp-2">{subtitle}</p>}
          {children}
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 shrink-0 cursor-pointer"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

Modal.Body = function ModalBody({ children, className = '' }) {
  return (
    <div className={`p-3 sm:p-3.5 max-h-[70vh] overflow-y-auto text-slate-900 flex-1 ${className}`}>
      {children}
    </div>
  );
};

Modal.Footer = function ModalFooter({ children, className = '' }) {
  return (
    <div className={`flex items-center justify-end gap-2 p-2.5 px-3 border-t border-slate-100 bg-slate-50/70 shrink-0 ${className}`}>
      {children}
    </div>
  );
};

