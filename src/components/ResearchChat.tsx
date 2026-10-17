import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, AlertCircle, ArrowUpRight, Zap, Database, HelpCircle, RotateCcw } from 'lucide-react';
import { ChatMessage, CrawlProgressEvent, Citation } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ResearchChatProps {
  messages: ChatMessage[];
  onSendMessage: (question: string) => Promise<void>;
  isGenerating: boolean;
  crawlProgress: CrawlProgressEvent | null;
  targetDomain?: string;
  onCitationClick?: (url: string) => void;
  error?: string | null;
  onRetry?: () => void;
}

const SUGGESTED_QUERIES = [
  'How does this framework handle routing and request parameters?',
  'Show a code example for installation and quickstart setup.',
  'What configuration options and environment variables are supported?',
  'What are common error codes and troubleshooting recommendations?',
];

export const ResearchChat: React.FC<ResearchChatProps> = ({
  messages,
  onSendMessage,
  isGenerating,
  crawlProgress,
  targetDomain,
  onCitationClick,
  error,
  onRetry,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating, crawlProgress]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;
    const text = input.trim();
    setInput('');
    await onSendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Live targeted crawl progress banner */}
      {crawlProgress && crawlProgress.type === 'targeted_crawl' && (
        <div className="bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border-b border-purple-800/40 px-4 py-2 flex items-center justify-between text-xs text-purple-200">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
            <span className="font-medium">
              Targeted Live Crawl: Discovering missing technical evidence from {crawlProgress.url || 'documentation'}...
            </span>
          </div>
        </div>
      )}

      {/* Messages stream */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center max-w-lg mx-auto text-center py-10 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/10">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Ask DocuMind AI
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Grounded hybrid technical retrieval combining pgvector semantic search, PostgreSQL full-text search, and targeted live crawler discovery.
              </p>
            </div>

            {/* Suggestions */}
            <div className="w-full space-y-1.5 pt-2 text-left">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" /> Suggested Research Questions
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {SUGGESTED_QUERIES.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSendMessage(q)}
                    className="p-2.5 rounded-md bg-slate-900 border border-slate-800 hover:border-cyan-500/60 text-xs text-slate-300 hover:text-cyan-200 transition-colors flex items-center justify-between text-left group cursor-pointer"
                  >
                    <span>{q}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-3xl ${
                msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white text-xs ${
                  msg.role === 'user'
                    ? 'bg-slate-800 text-slate-300 border border-slate-700'
                    : 'bg-gradient-to-br from-cyan-600 to-blue-600 text-white shadow-sm shadow-cyan-600/30'
                }`}
              >
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble */}
              <div
                className={`rounded-xl p-3.5 sm:p-4 text-xs transition-all ${
                  msg.role === 'user'
                    ? 'bg-slate-800 text-slate-100 max-w-lg border border-slate-700'
                    : 'bg-slate-900/90 text-slate-200 border border-slate-800 flex-1 shadow-sm'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                ) : (
                  <div>
                    <MarkdownRenderer content={msg.content} onCitationClick={onCitationClick} />

                    {/* Metadata & Retrieval Stats */}
                    {msg.retrievalMeta && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center gap-2.5 text-[10px] text-slate-500 font-mono">
                        {msg.retrievalMeta.queryRoute && (
                          <span
                            className="px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 capitalize font-mono text-[9px]"
                            title={msg.retrievalMeta.queryRouteReason || undefined}
                          >
                            Route: {msg.retrievalMeta.queryRoute.replace('_', ' ')}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-slate-400">
                          <Zap className="w-3 h-3 text-cyan-400" />
                          RRF Hybrid
                        </span>
                        <span>•</span>
                        <span>{msg.retrievalMeta.semanticHits} vector hits</span>
                        <span>•</span>
                        <span>{msg.retrievalMeta.keywordHits} keyword hits</span>
                        {msg.retrievalMeta.rerankedCount ? (
                          <>
                            <span>•</span>
                            <span>{msg.retrievalMeta.rerankedCount} re-ranked</span>
                          </>
                        ) : null}
                        {msg.retrievalMeta.targetedCrawledPages ? (
                          <>
                            <span>•</span>
                            <span className="text-purple-400 font-semibold">
                              +{msg.retrievalMeta.targetedCrawledPages} live crawled
                            </span>
                          </>
                        ) : null}
                        {msg.retrievalMeta.processingTimeMs && (
                          <>
                            <span>•</span>
                            <span>{msg.retrievalMeta.processingTimeMs}ms</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Grounded Citations Section */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Database className="w-3 h-3 text-cyan-400" /> Grounded Source Citations
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {msg.citations.map((c, cIdx) => (
                            <a
                              key={cIdx}
                              href={c.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => {
                                if (onCitationClick) {
                                  e.preventDefault();
                                  onCitationClick(c.url);
                                }
                              }}
                              className="p-2 rounded bg-slate-950 border border-slate-800/80 hover:border-cyan-500/60 transition-colors group block text-left"
                            >
                              <div className="text-[11px] font-medium text-cyan-300 group-hover:text-cyan-200 truncate flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 truncate">
                                  {(c.sourceDomain || (() => { try { return new URL(c.url).hostname; } catch { return ''; } })()) && (
                                    <span className="px-1 py-0.2 rounded bg-slate-900 border border-slate-800 text-[9px] font-mono text-cyan-400 shrink-0">
                                      {c.sourceDomain || (() => { try { return new URL(c.url).hostname; } catch { return ''; } })()}
                                    </span>
                                  )}
                                  <span className="truncate">{c.pageTitle}</span>
                                </div>
                                <ArrowUpRight className="w-3 h-3 shrink-0 opacity-60 group-hover:opacity-100" />
                              </div>
                              {c.heading && (
                                <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                                  #{c.heading}
                                </div>
                              )}
                              <p className="text-[10px] text-slate-500 line-clamp-1 mt-1 italic">
                                "{c.excerpt}"
                              </p>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Follow-up Questions Section */}
                    {msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                          <HelpCircle className="w-3 h-3" /> Recommended Follow-Up Questions
                        </span>
                        <div className="flex flex-col gap-1.5">
                          {msg.followUpQuestions.map((fq, fqIdx) => (
                            <button
                              key={fqIdx}
                              onClick={() => onSendMessage(fq)}
                              className="text-left p-2 rounded-md bg-slate-950/80 hover:bg-slate-900 border border-slate-800/80 hover:border-cyan-500/60 text-slate-300 hover:text-cyan-200 text-[11px] transition-colors flex items-center justify-between group cursor-pointer"
                            >
                              <span>{fq}</span>
                              <ArrowUpRight className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 shrink-0 ml-2" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Assistant Generating Indicator */}
        {isGenerating && (
          <div className="flex gap-3 max-w-3xl">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center text-white shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="rounded-xl p-3.5 bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center gap-2.5 shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Analyzing technical documentation & ranking hybrid evidence...</span>
            </div>
          </div>
        )}

        {/* Error State with Retry Button */}
        {error && (
          <div className="p-3.5 rounded-lg bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-white text-xs border border-rose-700 transition-colors shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Bar */}
      <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/80">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            placeholder={`Ask a question about ${targetDomain || 'the documentation'}... (Enter to send, Shift+Enter for new line)`}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-3 pr-12 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 resize-none font-sans"
          />
          <button
            type="submit"
            disabled={!input.trim() || isGenerating}
            className="absolute right-2.5 bottom-3.5 p-1.5 rounded-md bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-cyan-600/30 cursor-pointer"
            title="Send query"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
