import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Activity, CheckCircle2, AlertTriangle, Layers, Globe, FileCode, Database, Sparkles, RefreshCw } from 'lucide-react';
import { ResearchSession, CrawlProgressEvent } from '../types';

interface LiveCrawlMonitorProps {
  session: ResearchSession | null;
  crawlProgress: CrawlProgressEvent | null;
  onRefreshCrawl?: () => void;
  isCrawling?: boolean;
}

export const LiveCrawlMonitor: React.FC<LiveCrawlMonitorProps> = ({
  session,
  crawlProgress,
  onRefreshCrawl,
  isCrawling,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!session) return null;

  // Real data resolution: prioritize live SSE event then session record
  const discovered = crawlProgress?.discoveredCount ?? session.pagesDiscovered ?? 0;
  const crawled = crawlProgress?.crawledCount ?? session.pagesCrawled ?? session.pagesIndexed ?? 0;
  const extracted = crawlProgress?.extractedCount ?? session.pagesExtracted ?? session.pagesIndexed ?? 0;
  const indexed = crawlProgress?.indexedCount ?? session.pagesIndexed ?? 0;
  const failed = crawlProgress?.failedCount ?? session.pagesFailed ?? 0;
  const currentStage = crawlProgress?.currentStage ?? session.currentStage ?? session.crawlStatus ?? 'idle';
  const progressPercent = crawlProgress?.progressPercent ?? session.progressPercent ?? (session.crawlStatus === 'completed' ? 100 : 0);
  const objective = crawlProgress?.objective ?? session.researchObjective ?? 'General technical research & question answering';
  const activeMessage = crawlProgress?.message || (session.crawlStatus === 'completed' ? 'Index ready for hybrid queries' : 'Awaiting crawl');

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case 'sitemap_robots':
        return 'Discovering Sitemaps & robots.txt';
      case 'crawling':
        return 'Crawling Documentation Pages';
      case 'extracting':
        return 'Extracting Technical AST & Code';
      case 'indexing':
        return 'Building pgvector Embeddings & FTS';
      case 'completed':
        return 'Ready for Research Queries';
      case 'failed':
        return 'Crawling Encountered Errors';
      default:
        return 'Idle';
    }
  };

  const getStageColor = (status: string) => {
    switch (status) {
      case 'crawling':
        return 'text-amber-400 border-amber-500/40 bg-amber-950/40';
      case 'extracting':
        return 'text-sky-400 border-sky-500/40 bg-sky-950/40';
      case 'indexing':
        return 'text-cyan-400 border-cyan-500/40 bg-cyan-950/40';
      case 'completed':
        return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40';
      case 'failed':
        return 'text-rose-400 border-rose-500/40 bg-rose-950/40';
      default:
        return 'text-slate-400 border-slate-700 bg-slate-900';
    }
  };

  return (
    <div className="border-b border-slate-800 bg-slate-950/90 backdrop-blur transition-all">
      {/* Header bar / Toggle */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-900/40 transition-colors select-none"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <Activity className={`w-3.5 h-3.5 ${isCrawling ? 'text-cyan-400 animate-pulse' : 'text-slate-400'}`} />
            <span>Live Crawl & Index Monitor</span>
          </div>

          {/* Current Stage Badge */}
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${getStageColor(session.crawlStatus)}`}>
            {getStageLabel(currentStage)}
          </span>

          {/* Quick stats on collapsed bar */}
          {!isExpanded && (
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span>{discovered} discovered</span>
              <span>•</span>
              <span className="text-emerald-400">{indexed} indexed</span>
              {failed > 0 && <span className="text-rose-400">• {failed} failed</span>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Progress bar pill */}
          <div className="w-24 sm:w-32 bg-slate-900 rounded-full h-1.5 border border-slate-800 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(Math.max(progressPercent, 0), 100)}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
            {progressPercent}%
          </span>

          <button className="text-slate-400 hover:text-slate-200 p-0.5">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Metrics Panel */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 border-t border-slate-800/60 bg-slate-950/50 space-y-2.5">
          {/* Research Objective Banner */}
          <div className="flex items-start justify-between gap-2 text-xs bg-slate-900/60 p-2 rounded-md border border-slate-800/80">
            <div className="flex items-start gap-1.5 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
                  Active Research Objective
                </span>
                <p className="text-slate-300 text-[11px] truncate">{objective}</p>
              </div>
            </div>

            {onRefreshCrawl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRefreshCrawl();
                }}
                disabled={isCrawling}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-mono border border-slate-700 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                title="Restart or trigger fresh crawl"
              >
                <RefreshCw className={`w-3 h-3 ${isCrawling ? 'animate-spin text-cyan-400' : ''}`} />
                <span>{isCrawling ? 'Crawling...' : 'Re-crawl'}</span>
              </button>
            )}
          </div>

          {/* 5-Metric Counters Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {/* URLs Discovered */}
            <div className="p-2 rounded bg-slate-900/40 border border-slate-800 flex items-center gap-2">
              <div className="p-1.5 rounded bg-blue-950/80 text-blue-400 border border-blue-900/80">
                <Globe className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-500 font-medium">Discovered</div>
                <div className="text-sm font-bold text-slate-100 font-mono">{discovered}</div>
              </div>
            </div>

            {/* Pages Crawled */}
            <div className="p-2 rounded bg-slate-900/40 border border-slate-800 flex items-center gap-2">
              <div className="p-1.5 rounded bg-amber-950/80 text-amber-400 border border-amber-900/80">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-500 font-medium">Crawled</div>
                <div className="text-sm font-bold text-slate-100 font-mono">{crawled}</div>
              </div>
            </div>

            {/* Successfully Extracted */}
            <div className="p-2 rounded bg-slate-900/40 border border-slate-800 flex items-center gap-2">
              <div className="p-1.5 rounded bg-sky-950/80 text-sky-400 border border-sky-900/80">
                <FileCode className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-500 font-medium">Extracted</div>
                <div className="text-sm font-bold text-slate-100 font-mono">{extracted}</div>
              </div>
            </div>

            {/* Indexed into Vector Store */}
            <div className="p-2 rounded bg-slate-900/40 border border-slate-800 flex items-center gap-2">
              <div className="p-1.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-900/80">
                <Database className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-500 font-medium">Indexed (RRF)</div>
                <div className="text-sm font-bold text-emerald-400 font-mono">{indexed}</div>
              </div>
            </div>

            {/* Failed Pages */}
            <div className="p-2 rounded bg-slate-900/40 border border-slate-800 flex items-center gap-2">
              <div className="p-1.5 rounded bg-rose-950/80 text-rose-400 border border-rose-900/80">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-500 font-medium">Failed</div>
                <div className={`text-sm font-bold font-mono ${failed > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {failed}
                </div>
              </div>
            </div>
          </div>

          {/* Status Message Line */}
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 pt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isCrawling ? 'bg-cyan-400 animate-ping' : 'bg-emerald-400'}`} />
            <span className="text-slate-300 truncate">{activeMessage}</span>
            {crawlProgress?.url && (
              <span className="text-slate-500 truncate ml-auto hidden md:inline">
                Target: {crawlProgress.url}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
