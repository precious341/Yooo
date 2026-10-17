import React, { useState } from 'react';
import { Search, Folder, FileText, ChevronRight, ChevronDown, CheckCircle2, Clock, AlertCircle, RefreshCw, Globe, ExternalLink, Eye } from 'lucide-react';
import { DocPage, DocCategory } from '../types';

interface DocumentationExplorerProps {
  pages: DocPage[];
  selectedPage: DocPage | null;
  onSelectPage: (page: DocPage) => void;
  onRefreshPage?: (url: string) => void;
  onRetryPage?: (pageId: string) => void;
  isCrawling?: boolean;
  sourceName?: string;
  rootUrl?: string;
  onAddSourceClick?: () => void;
}

export const DocumentationExplorer: React.FC<DocumentationExplorerProps> = ({
  pages,
  selectedPage,
  onSelectPage,
  onRefreshPage,
  onRetryPage,
  isCrawling,
  sourceName,
  rootUrl,
  onAddSourceClick,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'indexed' | 'crawled' | 'discovered' | 'failed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Extract unique domains from pages
  const uniqueDomains = Array.from(
    new Set(
      pages.map((p) => {
        if (p.sourceDomain) return p.sourceDomain;
        try {
          return new URL(p.url).hostname;
        } catch {
          return 'docs';
        }
      })
    )
  ).filter(Boolean);

  // Extract available categories from current pages
  const availableCategories = Array.from(
    new Set(pages.map(p => p.category).filter(Boolean))
  ) as DocCategory[];

  // Filter pages
  const filteredPages = pages.filter((page) => {
    const pageDomain = page.sourceDomain || (() => {
      try { return new URL(page.url).hostname; } catch { return 'docs'; }
    })();

    const matchesDomain = domainFilter === 'all' || pageDomain === domainFilter;

    const matchesCategory =
      categoryFilter === 'all' || page.category === categoryFilter;

    const matchesSearch =
      page.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      page.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (page.category && page.category.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'indexed' && page.crawlStatus === 'indexed') ||
      (statusFilter === 'crawled' && (page.crawlStatus === 'crawled' || page.crawlStatus === 'indexed')) ||
      (statusFilter === 'discovered' && page.crawlStatus === 'discovered') ||
      (statusFilter === 'failed' && page.crawlStatus === 'failed');

    return matchesDomain && matchesCategory && matchesSearch && matchesStatus;
  });

  // Group pages by path hierarchy for tree view
  const buildTree = () => {
    const tree: Record<string, DocPage[]> = {};

    for (const page of filteredPages) {
      try {
        const parsed = new URL(page.url);
        const segments = parsed.pathname.split('/').filter(Boolean);
        const folder = segments.length > 1 ? segments.slice(0, -1).join('/') : 'root';

        if (!tree[folder]) tree[folder] = [];
        tree[folder].push(page);
      } catch {
        if (!tree['root']) tree['root'] = [];
        tree['root'].push(page);
      }
    }

    return tree;
  };

  const treeGroups = buildTree();

  const toggleFolder = (folder: string) => {
    setExpandedFolders(prev => ({ ...prev, [folder]: !prev[folder] }));
  };

  const getStatusBadge = (status: DocPage['crawlStatus']) => {
    switch (status) {
      case 'indexed':
        return (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
            <CheckCircle2 className="w-3 h-3" /> Indexed
          </span>
        );
      case 'crawled':
        return (
          <span className="flex items-center gap-1 text-[10px] text-cyan-400 font-mono">
            <Clock className="w-3 h-3" /> Crawled
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1 text-[10px] text-rose-400 font-mono">
            <AlertCircle className="w-3 h-3" /> Failed
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
            <Clock className="w-3 h-3" /> Discovered
          </span>
        );
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950/60 border-r border-slate-800/80">
      {/* Documentation Source Information Header */}
      {sourceName && (
        <div className="p-3 border-b border-slate-800 bg-slate-900/40">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded bg-cyan-950/80 border border-cyan-800 flex items-center justify-center text-cyan-400 shrink-0">
                <Globe className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-slate-100 truncate">
                  {sourceName}
                </h3>
                {rootUrl && (
                  <a
                    href={rootUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-cyan-400/80 hover:text-cyan-300 hover:underline flex items-center gap-1 font-mono truncate"
                    title="Open root documentation in new tab"
                  >
                    <span className="truncate">{rootUrl}</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onAddSourceClick && (
                <button
                  onClick={onAddSourceClick}
                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-950 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800 transition-colors cursor-pointer"
                  title="Add another documentation source to session"
                >
                  + Source
                </button>
              )}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 font-mono">
                {pages.length} pgs
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Domain Filter Tabs if multiple domains exist */}
      {uniqueDomains.length > 1 && (
        <div className="px-3 pt-2 pb-1 border-b border-slate-800/60 flex items-center gap-1 overflow-x-auto text-[10px]">
          <button
            onClick={() => setDomainFilter('all')}
            className={`px-2 py-0.5 rounded font-mono shrink-0 cursor-pointer transition-colors ${
              domainFilter === 'all'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Domains ({pages.length})
          </button>
          {uniqueDomains.map((dom) => {
            const count = pages.filter(p => (p.sourceDomain || p.url).includes(dom)).length;
            return (
              <button
                key={dom}
                onClick={() => setDomainFilter(dom)}
                className={`px-2 py-0.5 rounded font-mono shrink-0 cursor-pointer transition-colors ${
                  domainFilter === dom
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {dom} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Search & Header Bar */}
      <div className="p-3 border-b border-slate-800 space-y-2">
        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search discovered pages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900/90 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {(['all', 'indexed', 'crawled', 'discovered', 'failed'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors capitalize cursor-pointer shrink-0 ${
                statusFilter === filter
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800/60'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Category filter pills if categories exist */}
        {availableCategories.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 pt-0.5">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono shrink-0 transition-colors cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-blue-950 text-blue-300 border border-blue-800'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800/40'
              }`}
            >
              All Categories
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono shrink-0 transition-colors cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-blue-950 text-blue-300 border border-blue-800'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800/40'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pages list / tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {pages.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            {isCrawling ? (
              <div className="space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-cyan-400" />
                <p>Discovering documentation structure...</p>
              </div>
            ) : (
              <p>No pages crawled yet. Start research to begin discovering internal links.</p>
            )}
          </div>
        ) : filteredPages.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            No documentation pages match your search filter.
          </div>
        ) : (
          Object.entries(treeGroups).map(([folder, folderPages]) => {
            const isExpanded = expandedFolders[folder] !== false; // default open

            return (
              <div key={folder} className="space-y-1">
                {folder !== 'root' && (
                  <button
                    onClick={() => toggleFolder(folder)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 text-[11px] font-mono group cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <Folder className="w-3.5 h-3.5 text-cyan-500/70 group-hover:text-cyan-400" />
                    <span className="truncate">{folder}</span>
                    <span className="text-[10px] text-slate-600 ml-auto">({folderPages.length})</span>
                  </button>
                )}

                {(folder === 'root' || isExpanded) && (
                  <div className={`space-y-1 ${folder !== 'root' ? 'pl-3 border-l border-slate-800/60 ml-2' : ''}`}>
                    {folderPages.map((page) => {
                      const isSelected = selectedPage?.id === page.id;

                      return (
                        <div
                          key={page.id}
                          onClick={() => onSelectPage(page)}
                          className={`w-full group p-2.5 rounded-md border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-slate-800/90 border-cyan-500/70 shadow-sm'
                              : 'bg-slate-900/40 border-slate-800/50 hover:bg-slate-900 hover:border-slate-700/80'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-1.5 min-w-0">
                              <FileText className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0 group-hover:text-cyan-400" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {uniqueDomains.length > 1 && (
                                    <span className="px-1 py-0.2 rounded bg-slate-800 text-[9px] font-mono text-cyan-400 shrink-0">
                                      {page.sourceDomain || (() => { try { return new URL(page.url).hostname; } catch { return 'docs'; } })()}
                                    </span>
                                  )}
                                  {page.category && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-blue-950/80 text-blue-300 border border-blue-900/60 shrink-0">
                                      {page.category}
                                    </span>
                                  )}
                                  <h4 className="text-xs font-medium text-slate-200 truncate group-hover:text-cyan-200">
                                    {page.title || 'Untitled Page'}
                                  </h4>
                                </div>
                                <p className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">
                                  {page.url}
                                </p>
                              </div>
                            </div>
                            <div className="shrink-0">{getStatusBadge(page.crawlStatus)}</div>
                          </div>

                          {/* Error message and Retry Button if failed */}
                          {page.crawlStatus === 'failed' && (
                            <div className="mt-2 p-1.5 rounded bg-rose-950/50 border border-rose-900/60 text-[10px] text-rose-300 font-mono flex items-center justify-between gap-2">
                              <span className="truncate">{page.errorMessage || 'Failed to crawl page'}</span>
                              {onRetryPage && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRetryPage(page.id);
                                  }}
                                  className="px-2 py-0.5 rounded bg-rose-800 hover:bg-rose-700 text-rose-100 font-sans font-medium text-[10px] shrink-0 transition-colors cursor-pointer"
                                  title="Retry crawling this page"
                                >
                                  Retry
                                </button>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/40 text-[10px] text-slate-500 font-mono">
                            <div className="flex items-center gap-2">
                              <span>{page.headings.length} headings</span>
                              <span>•</span>
                              <span>{page.wordCount} words</span>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectPage(page);
                              }}
                              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-opacity"
                              title="Inspect page source"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Preview</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
