import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { SessionCreatorModal } from './components/SessionCreatorModal';
import { LiveCrawlMonitor } from './components/LiveCrawlMonitor';
import { DocumentationExplorer } from './components/DocumentationExplorer';
import { ResearchChat } from './components/ResearchChat';
import { SourcesPanel } from './components/SourcesPanel';
import { PageDetailModal } from './components/PageDetailModal';
import { AddSourceModal } from './components/AddSourceModal';
import { KnowledgeGraphModal } from './components/KnowledgeGraphModal';
import { ResearchAnalyticsModal } from './components/ResearchAnalyticsModal';
import { EvaluationDashboardModal } from './components/EvaluationDashboardModal';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { ResearchSession, DocPage, ChatMessage, CrawlProgressEvent } from './types';
import { api } from './services/api';
import { Folder, MessageSquare, Database, Plus, PanelRight, AlertCircle, Bot, CheckCircle2, Layers } from 'lucide-react';

export default function App() {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [activeSession, setActiveSession] = useState<ResearchSession | null>(null);
  const [pages, setPages] = useState<DocPage[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedPage, setSelectedPage] = useState<DocPage | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isEvaluationOpen, setIsEvaluationOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgressEvent | null>(null);
  const [activeTab, setActiveTab] = useState<'explorer' | 'chat' | 'sources'>('chat');
  const [isSourcesPanelOpen, setIsSourcesPanelOpen] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Load all sessions
  const loadSessions = useCallback(async () => {
    try {
      const list = await api.getSessions();
      setSessions(list);
      if (list.length > 0 && !activeSession) {
        setActiveSession(list[0]);
      }
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
    }
  }, [activeSession]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load pages and chat history when active session changes
  const loadSessionData = useCallback(async (sessionId: string) => {
    try {
      const [fetchedPages, fetchedMessages] = await Promise.all([
        api.getPages(sessionId),
        api.getChatHistory(sessionId),
      ]);
      setPages(fetchedPages);
      setMessages(fetchedMessages);
    } catch (err: any) {
      console.error('Failed to load session data:', err);
    }
  }, []);

  useEffect(() => {
    if (!activeSession) return;

    loadSessionData(activeSession.id);

    // Subscribe to SSE progress
    const unsubscribe = api.subscribeToProgress(activeSession.id, (event) => {
      setCrawlProgress(event);

      if (
        event.type === 'page_crawled' ||
        event.type === 'page_indexed' ||
        event.type === 'crawl_completed' ||
        event.type === 'targeted_crawl'
      ) {
        // Refresh pages list
        api.getPages(activeSession.id).then(setPages).catch(console.error);

        // Update active session stats with real backend data
        setActiveSession((prev) =>
          prev
            ? {
                ...prev,
                pagesDiscovered: event.discoveredCount,
                pagesCrawled: event.crawledCount ?? prev.pagesCrawled ?? event.indexedCount,
                pagesExtracted: event.extractedCount ?? prev.pagesExtracted ?? event.indexedCount,
                pagesIndexed: event.indexedCount,
                pagesFailed: event.failedCount ?? prev.pagesFailed ?? 0,
                progressPercent: event.progressPercent ?? prev.progressPercent ?? (event.type === 'crawl_completed' ? 100 : prev.progressPercent),
                currentStage: (event.currentStage as any) ?? prev.currentStage,
                crawlStatus: event.status === 'indexing' ? 'indexing' : event.type === 'crawl_completed' ? 'completed' : prev.crawlStatus,
              }
            : null
        );
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeSession, loadSessionData]);

  // Create new session
  const handleCreateSession = async (data: {
    targetUrl: string;
    researchObjective?: string;
    docVersion?: string;
    maxPages?: number;
    autoStartCrawl: boolean;
    sources?: Array<{ targetUrl: string; name?: string; docVersion?: string }>;
  }) => {
    setErrorBanner(null);
    setLastFailedQuestion(null);
    const newSession = await api.createSession(data);
    setSessions((prev) => [newSession, ...prev]);
    setActiveSession(newSession);
    setPages([]);
    setMessages([]);
    setActiveTab('chat');
  };

  // Trigger or resume crawl
  const handleRefreshCrawl = async () => {
    if (!activeSession) return;
    try {
      setErrorBanner(null);
      await api.startCrawl(activeSession.id);
      setActiveSession((prev) => (prev ? { ...prev, crawlStatus: 'crawling' } : null));
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to start crawl');
    }
  };

  // Add additional documentation source to active session
  const handleAddSource = async (data: {
    targetUrl: string;
    name?: string;
    docVersion?: string;
    maxPages?: number;
  }) => {
    if (!activeSession) return;
    try {
      setErrorBanner(null);
      const res = await api.addSource(activeSession.id, data);
      if (res?.sources) {
        setActiveSession((prev) => (prev ? { ...prev, sources: res.sources, crawlStatus: 'crawling' } : null));
      }
      // Re-fetch pages
      await loadSessionData(activeSession.id);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to add documentation source');
      throw err;
    }
  };

  // Submit question
  const handleSendMessage = async (question: string) => {
    if (!activeSession) return;
    try {
      setIsGenerating(true);
      setErrorBanner(null);
      setLastFailedQuestion(null);

      // Optimistic user message
      const tempUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        sessionId: activeSession.id,
        role: 'user',
        content: question,
        citations: [],
        sourcesUsed: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      // Call hybrid search & answer generation API
      const responseMsg = await api.sendQuestion(activeSession.id, question, activeSession.docVersion);

      // Replace or append response
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempUserMsg.id);
        return [...withoutTemp, tempUserMsg, responseMsg];
      });

      // Reload pages in case targeted live crawl added new pages
      loadSessionData(activeSession.id);
    } catch (err: any) {
      setLastFailedQuestion(question);
      setErrorBanner(err.message || 'Failed to process question. Please retry.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Retry last failed question
  const handleRetryLastQuestion = () => {
    if (lastFailedQuestion) {
      handleSendMessage(lastFailedQuestion);
    }
  };

  // Refresh single page
  const handleRefreshPage = async (url: string) => {
    if (!activeSession) return;
    await api.refreshPage(activeSession.id, url);
    await loadSessionData(activeSession.id);
  };

  // Retry crawling a failed page
  const handleRetryPage = async (pageId: string) => {
    if (!activeSession) return;
    try {
      await api.retryPage(activeSession.id, pageId);
      await loadSessionData(activeSession.id);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to retry page crawl');
    }
  };

  // Open Delete Confirmation Modal
  const handleRequestDeleteSession = () => {
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  // Perform verified deletion of session and temporary indexes
  const handleConfirmDeleteSession = async () => {
    if (!activeSession || isDeletingSession) return;
    setIsDeletingSession(true);
    setDeleteError(null);
    try {
      const targetId = activeSession.id;
      const targetDomain = activeSession.rootDomain;
      await api.deleteSession(targetId);

      const remaining = sessions.filter((s) => s.id !== targetId);
      setSessions(remaining);
      setIsDeleteModalOpen(false);
      setSuccessBanner(`Research session for "${targetDomain}" and its temporary index records were successfully deleted.`);
      setTimeout(() => setSuccessBanner(null), 5000);

      if (remaining.length > 0) {
        setActiveSession(remaining[0]);
        await loadSessionData(remaining[0].id);
      } else {
        setActiveSession(null);
        setPages([]);
        setMessages([]);
      }
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete session and temporary index. Please try again.');
    } finally {
      setIsDeletingSession(false);
    }
  };

  // Open page modal by URL
  const handleCitationClick = (url: string) => {
    const found = pages.find((p) => p.url === url || p.canonicalUrl === url);
    if (found) {
      setSelectedPage(found);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant') || null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navigation Bar */}
      <Navbar
        sessions={sessions}
        activeSession={activeSession}
        onSelectSession={setActiveSession}
        onNewSessionClick={() => setIsModalOpen(true)}
        onRefreshCrawl={handleRefreshCrawl}
        isCrawling={activeSession?.crawlStatus === 'crawling'}
        onOpenKnowledgeGraph={() => setIsGraphOpen(true)}
        onOpenAnalytics={() => setIsAnalyticsOpen(true)}
        onOpenEvaluation={() => setIsEvaluationOpen(true)}
        onDeleteSession={handleRequestDeleteSession}
      />

      {/* Collapsible Live Crawl & Processing Monitor */}
      {activeSession && (
        <LiveCrawlMonitor
          session={activeSession}
          crawlProgress={crawlProgress}
          onRefreshCrawl={handleRefreshCrawl}
          isCrawling={activeSession.crawlStatus === 'crawling'}
        />
      )}

      {/* Global Success Banner */}
      {successBanner && (
        <div className="bg-emerald-950/80 border-b border-emerald-800/80 px-4 py-2 text-xs text-emerald-300 flex items-center justify-between animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-400 hover:text-emerald-200 text-xs ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Global Error Banner */}
      {errorBanner && (
        <div className="bg-rose-950/80 border-b border-rose-800/80 px-4 py-2 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-rose-400 hover:text-rose-200 text-xs ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {sessions.length === 0 ? (
          /* Empty / Welcome State - Developer Tool Design */
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-lg w-full bg-slate-900/80 border border-slate-800 rounded-lg p-7 text-center space-y-5 shadow-xl">
              <div className="w-12 h-12 rounded-lg bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-cyan-400 mx-auto">
                <Layers className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold tracking-tight text-white">
                  DocuMind AI Research Workspace
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                  Multi-source technical documentation retrieval engine. Crawls approved documentation domains, discovers hierarchies, indexes with PostgreSQL pgvector & full-text search, and produces grounded answers with citations.
                </p>
              </div>

              {/* Technical Capabilities Badges */}
              <div className="grid grid-cols-2 gap-2 text-left pt-1">
                <div className="p-2.5 rounded border border-slate-800/80 bg-slate-950/50">
                  <div className="text-[11px] font-mono text-cyan-400 font-medium">Automatic Discovery</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Sitemap parsing & URL tree exploration</div>
                </div>
                <div className="p-2.5 rounded border border-slate-800/80 bg-slate-950/50">
                  <div className="text-[11px] font-mono text-emerald-400 font-medium">Hybrid Search (RRF)</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">768-dim pgvector + BM25 keyword rank</div>
                </div>
                <div className="p-2.5 rounded border border-slate-800/80 bg-slate-950/50">
                  <div className="text-[11px] font-mono text-blue-400 font-medium">Evidence Grounding</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Verifiable citations & heading anchors</div>
                </div>
                <div className="p-2.5 rounded border border-slate-800/80 bg-slate-950/50">
                  <div className="text-[11px] font-mono text-amber-400 font-medium">Quality Benchmarks</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Precision@K, Recall@K & MRR metrics</div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="w-full py-2.5 px-4 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs border border-cyan-500/50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Start Documentation Research Session</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Responsive Three Panel Workspace */
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
            {/* Mobile Tab Switcher */}
            <div className="md:hidden flex border-b border-slate-800 bg-slate-900 text-xs">
              <button
                onClick={() => setActiveTab('explorer')}
                className={`flex-1 py-2 text-center flex items-center justify-center gap-1.5 border-b-2 font-medium ${
                  activeTab === 'explorer'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-slate-400'
                }`}
              >
                <Folder className="w-3.5 h-3.5" /> Explorer
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-2 text-center flex items-center justify-center gap-1.5 border-b-2 font-medium ${
                  activeTab === 'chat'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-slate-400'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> Chat
              </button>
              <button
                onClick={() => setActiveTab('sources')}
                className={`flex-1 py-2 text-center flex items-center justify-center gap-1.5 border-b-2 font-medium ${
                  activeTab === 'sources'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-slate-400'
                }`}
              >
                <Database className="w-3.5 h-3.5" /> Sources
              </button>
            </div>

            {/* LEFT PANEL: DOCUMENTATION EXPLORER */}
            <div
              className={`w-full md:w-72 lg:w-80 shrink-0 h-full overflow-hidden ${
                activeTab === 'explorer' ? 'block' : 'hidden md:block'
              }`}
            >
              <DocumentationExplorer
                pages={pages}
                selectedPage={selectedPage}
                onSelectPage={setSelectedPage}
                onRefreshPage={handleRefreshPage}
                onRetryPage={handleRetryPage}
                isCrawling={activeSession?.crawlStatus === 'crawling'}
                sourceName={activeSession?.rootDomain}
                rootUrl={activeSession?.targetUrl}
                onAddSourceClick={() => setIsAddSourceOpen(true)}
              />
            </div>

            {/* CENTER PANEL: AI RESEARCH ASSISTANT */}
            <div
              className={`flex-1 h-full overflow-hidden flex flex-col relative ${
                activeTab === 'chat' ? 'flex' : 'hidden md:flex'
              }`}
            >
              {/* Header bar controls: toggle right panel */}
              <div className="hidden lg:flex items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-slate-950/40 text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="font-semibold text-slate-200">
                    {activeSession?.rootDomain}
                  </span>
                  {activeSession?.docVersion && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-cyan-400">
                      {activeSession.docVersion}
                    </span>
                  )}
                  {activeSession?.sources && activeSession.sources.length > 1 && (
                    <span className="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-[10px] font-mono text-cyan-300">
                      {activeSession.sources.length} sources linked
                    </span>
                  )}
                </div>

                {!isSourcesPanelOpen && (
                  <button
                    onClick={() => setIsSourcesPanelOpen(true)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 text-xs transition-colors cursor-pointer"
                    title="Open Sources & Evidence Panel"
                  >
                    <PanelRight className="w-3.5 h-3.5" />
                    <span>Show Sources ({lastAssistantMessage?.citations?.length || 0})</span>
                  </button>
                )}
              </div>

              <ResearchChat
                messages={messages}
                onSendMessage={handleSendMessage}
                isGenerating={isGenerating}
                crawlProgress={crawlProgress}
                targetDomain={activeSession?.rootDomain}
                onCitationClick={handleCitationClick}
                error={lastFailedQuestion ? 'Failed to process question. Click retry below.' : null}
                onRetry={handleRetryLastQuestion}
              />
            </div>

            {/* RIGHT PANEL: SOURCES AND EVIDENCE */}
            {isSourcesPanelOpen && (
              <div
                className={`w-full md:w-72 lg:w-84 shrink-0 h-full overflow-hidden transition-all ${
                  activeTab === 'sources' ? 'block' : 'hidden lg:block'
                }`}
              >
                <SourcesPanel
                  session={activeSession}
                  lastMessage={lastAssistantMessage}
                  pages={pages}
                  messages={messages}
                  onDeleteSession={handleRequestDeleteSession}
                  onPageClick={setSelectedPage}
                  onClose={() => setIsSourcesPanelOpen(false)}
                  onAddSourceClick={() => setIsAddSourceOpen(true)}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Session Creator Modal */}
      <SessionCreatorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateSession}
      />

      {/* Add Source to Session Modal */}
      <AddSourceModal
        isOpen={isAddSourceOpen}
        onClose={() => setIsAddSourceOpen(false)}
        onSubmit={handleAddSource}
        existingDomains={activeSession?.sources?.map((s) => s.rootDomain) || (activeSession ? [activeSession.rootDomain] : [])}
      />

      {/* Documentation Knowledge Graph Modal */}
      <KnowledgeGraphModal
        isOpen={isGraphOpen}
        onClose={() => setIsGraphOpen(false)}
        pages={pages}
        onSelectPage={setSelectedPage}
      />

      {/* Research Quality Analytics Modal */}
      <ResearchAnalyticsModal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        session={activeSession}
        pages={pages}
        messages={messages}
      />

      {/* Research Quality Evaluation Benchmark Modal */}
      <EvaluationDashboardModal
        isOpen={isEvaluationOpen}
        onClose={() => setIsEvaluationOpen(false)}
        session={activeSession}
        pages={pages}
        onSelectPage={setSelectedPage}
      />

      {/* Page Inspector Modal */}
      <PageDetailModal
        page={selectedPage}
        onClose={() => setSelectedPage(null)}
        onRefreshPage={handleRefreshPage}
      />

      {/* Permanent Session Deletion Modal */}
      <ConfirmDeleteModal
        isOpen={isDeleteModalOpen}
        session={activeSession}
        isDeleting={isDeletingSession}
        error={deleteError}
        onConfirm={handleConfirmDeleteSession}
        onClose={() => {
          if (!isDeletingSession) setIsDeleteModalOpen(false);
        }}
      />
    </div>
  );
}
