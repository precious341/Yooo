import React, { useState } from 'react';
import { X, ExternalLink, RefreshCw, Hash, Calendar, Layers, Link as LinkIcon, FileText } from 'lucide-react';
import { DocPage } from '../types';

interface PageDetailModalProps {
  page: DocPage | null;
  onClose: () => void;
  onRefreshPage?: (url: string) => Promise<void>;
}

export const PageDetailModal: React.FC<PageDetailModalProps> = ({
  page,
  onClose,
  onRefreshPage,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!page) return null;

  const handleRefresh = async () => {
    if (!onRefreshPage) return;
    try {
      setIsRefreshing(true);
      await onRefreshPage(page.url);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800 uppercase">
                {page.crawlStatus}
              </span>
              {page.docVersion && (
                <span className="text-[10px] font-mono text-slate-400">
                  Version: {page.docVersion}
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-white mt-1 truncate">{page.title}</h2>
            <a
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-cyan-400 hover:underline flex items-center gap-1 font-mono truncate mt-0.5"
            >
              {page.url}
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onRefreshPage && (
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 transition-colors disabled:opacity-50"
                title="Refresh page and re-index"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* Metadata badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-md bg-slate-950 border border-slate-800/80">
              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <FileText className="w-3 h-3 text-cyan-400" /> Word Count
              </div>
              <div className="text-sm font-semibold text-slate-200 mt-1 font-mono">{page.wordCount}</div>
            </div>

            <div className="p-2.5 rounded-md bg-slate-950 border border-slate-800/80">
              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <Layers className="w-3 h-3 text-cyan-400" /> Headings
              </div>
              <div className="text-sm font-semibold text-slate-200 mt-1 font-mono">{page.headings.length}</div>
            </div>

            <div className="p-2.5 rounded-md bg-slate-950 border border-slate-800/80">
              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <LinkIcon className="w-3 h-3 text-cyan-400" /> Internal Links
              </div>
              <div className="text-sm font-semibold text-slate-200 mt-1 font-mono">{page.links.length}</div>
            </div>

            <div className="p-2.5 rounded-md bg-slate-950 border border-slate-800/80">
              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-cyan-400" /> Crawled At
              </div>
              <div className="text-[11px] font-mono text-slate-300 mt-1 truncate">
                {new Date(page.crawledAt).toLocaleTimeString()}
              </div>
            </div>
          </div>

          {/* Canonical URL & Content Hash */}
          <div className="p-3 rounded-md bg-slate-950 border border-slate-800/80 space-y-1.5 font-mono text-[11px]">
            {page.canonicalUrl && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 shrink-0">Canonical:</span>
                <span className="text-slate-300 truncate">{page.canonicalUrl}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-slate-500 shrink-0">SHA256:</span>
              <span className="text-slate-400 truncate">{page.contentHash}</span>
            </div>
          </div>

          {/* Headings Hierarchy */}
          <div>
            <h3 className="font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-cyan-400" /> Extracted Headings Hierarchy
            </h3>
            {page.headings.length === 0 ? (
              <p className="text-slate-500 italic">No headings found on this page.</p>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1 bg-slate-950 p-2.5 rounded-md border border-slate-800">
                {page.headings.map((h, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 font-mono text-[11px]"
                    style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
                  >
                    <span className="text-cyan-500/70 text-[10px]">H{h.level}</span>
                    <span className="text-slate-300 truncate">{h.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Raw Content Excerpt Preview */}
          <div>
            <h3 className="font-semibold text-slate-200 mb-2">Content Preview</h3>
            <div className="max-h-48 overflow-y-auto bg-slate-950 p-3 rounded-md border border-slate-800 font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
              {page.rawMarkdown ? page.rawMarkdown.slice(0, 2000) : 'No preview available'}
              {page.rawMarkdown && page.rawMarkdown.length > 2000 && '\n\n... (preview truncated)'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
