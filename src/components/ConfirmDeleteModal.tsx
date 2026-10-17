import React, { useEffect } from 'react';
import { Trash2, AlertTriangle, Loader2, X, Database, Globe, Layers } from 'lucide-react';
import { ResearchSession } from '../types';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  session: ResearchSession | null;
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  session,
  isDeleting,
  error,
  onConfirm,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen || !session) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-lg shadow-xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-session-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 id="delete-session-title" className="text-sm font-semibold text-slate-100">
                Delete Research Session & Temporary Index
              </h2>
              <p className="text-[11px] text-slate-400">
                Permanent cleanup of session-scoped vector and full-text index records
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isDeleting}
            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-md bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1">
                <span className="font-semibold block">Deletion Failed</span>
                <span className="text-[11px] text-rose-300/90">{error}</span>
              </div>
            </div>
          )}

          <p className="text-slate-300 leading-relaxed">
            Are you sure you want to delete this research session? This operation will remove all temporary data from PostgreSQL and pgvector storage:
          </p>

          {/* Technical Scope Breakdown */}
          <div className="p-3.5 rounded-md bg-slate-950/60 border border-slate-800 space-y-2.5 font-mono text-[11px]">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                Target Domain
              </span>
              <span className="text-slate-200 font-semibold truncate max-w-[240px]">
                {session.rootDomain}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                Indexed Pages
              </span>
              <span className="text-slate-200">
                {session.pagesIndexed} pages ({session.pagesDiscovered} discovered)
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-blue-400" />
                Vector Storage
              </span>
              <span className="text-slate-300">
                pgvector (768-dim) + FTS (RRF)
              </span>
            </div>
          </div>

          <div className="p-3 rounded bg-amber-950/20 border border-amber-900/40 text-[11px] text-amber-300/90 leading-relaxed">
            <span className="font-semibold text-amber-200 block mb-0.5">Note:</span>
            Deleting this session removes all associated document chunks, embeddings, extracted markdown, chat citations, and evaluation tests. Other active sessions remain unaffected.
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/40 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-3.5 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 border border-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-1.5 rounded-md text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 border border-rose-500/60 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting Session & Index...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Session & Temporary Index</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
