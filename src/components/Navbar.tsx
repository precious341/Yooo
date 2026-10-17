import { Bot, Plus, Clock, ExternalLink, RefreshCw, Network, BarChart3, Target, Trash2 } from 'lucide-react';
import { ResearchSession } from '../types';

interface NavbarProps {
  sessions: ResearchSession[];
  activeSession: ResearchSession | null;
  onSelectSession: (session: ResearchSession) => void;
  onNewSessionClick: () => void;
  onRefreshCrawl?: () => void;
  isCrawling?: boolean;
  onOpenKnowledgeGraph?: () => void;
  onOpenAnalytics?: () => void;
  onOpenEvaluation?: () => void;
  onDeleteSession?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  sessions,
  activeSession,
  onSelectSession,
  onNewSessionClick,
  onRefreshCrawl,
  isCrawling,
  onOpenKnowledgeGraph,
  onOpenAnalytics,
  onOpenEvaluation,
  onDeleteSession,
}) => {
  // Format expiration remaining time
  const getExpiresIn = (expiresAt?: string) => {
    if (!expiresAt) return '24h retention';
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return 'Expired';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    return `Expires in ${hours}h`;
  };

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-sm shadow-cyan-500/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-white">DocuMind</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800">
                AI
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block">Multi-Source Hybrid RAG Agent</p>
          </div>
        </div>

        {/* Vertical divider */}
        <div className="h-6 w-px bg-slate-800 mx-1 hidden md:block"></div>

        {/* Active Session Dropdown / Selector */}
        {sessions.length > 0 && (
          <div className="hidden sm:flex items-center gap-2">
            <select
              value={activeSession?.id || ''}
              onChange={(e) => {
                const s = sessions.find((x) => x.id === e.target.value);
                if (s) onSelectSession(s);
              }}
              className="bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 max-w-[220px] truncate"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.rootDomain} ({s.pagesIndexed} pages)
                </option>
              ))}
            </select>

            {activeSession && (
              <div className="flex items-center gap-1">
                <a
                  href={activeSession.targetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-cyan-400 p-1 rounded hover:bg-slate-800 transition-colors"
                  title="Visit source documentation"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                {onDeleteSession && (
                  <button
                    onClick={onDeleteSession}
                    className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Delete session & temporary index"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-3">
        {/* Retention timer badge */}
        {activeSession && (
          <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>{getExpiresIn(activeSession.expiresAt)}</span>
          </div>
        )}

        {/* Crawl status badge */}
        {activeSession && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-slate-900 border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                activeSession.crawlStatus === 'crawling'
                  ? 'bg-amber-400 animate-pulse'
                  : activeSession.crawlStatus === 'indexing'
                  ? 'bg-cyan-400 animate-pulse'
                  : activeSession.crawlStatus === 'completed'
                  ? 'bg-emerald-400'
                  : 'bg-slate-500'
              }`}
            />
            <span className="capitalize text-slate-300 text-[11px]">
              {activeSession.crawlStatus === 'crawling'
                ? 'Crawling...'
                : activeSession.crawlStatus === 'indexing'
                ? 'Indexing...'
                : `${activeSession.pagesIndexed} Pages Indexed`}
            </span>
          </div>
        )}

        {/* Refresh Crawl Button */}
        {activeSession && onRefreshCrawl && (
          <button
            onClick={onRefreshCrawl}
            disabled={isCrawling}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800 disabled:opacity-50"
            title="Resume or trigger crawl"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCrawling ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        )}

        {/* Knowledge Graph Button */}
        {activeSession && onOpenKnowledgeGraph && (
          <button
            onClick={onOpenKnowledgeGraph}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 text-xs transition-colors cursor-pointer"
            title="Open Documentation Relationship Graph"
          >
            <Network className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Graph</span>
          </button>
        )}

        {/* Analytics Button */}
        {activeSession && onOpenAnalytics && (
          <button
            onClick={onOpenAnalytics}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-emerald-300 border border-slate-800 text-xs transition-colors cursor-pointer"
            title="View Research Quality Analytics"
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Analytics</span>
          </button>
        )}

        {/* Evaluation Dashboard Button */}
        {activeSession && onOpenEvaluation && (
          <button
            onClick={onOpenEvaluation}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 text-xs transition-colors cursor-pointer"
            title="Open Research Quality Evaluation Dashboard (Precision, Recall, MRR)"
          >
            <Target className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Evaluation</span>
          </button>
        )}

        {/* Start New Research Session Button */}
        <button
          onClick={onNewSessionClick}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs shadow-sm shadow-cyan-600/30 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New Research</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>
    </header>
  );
};
