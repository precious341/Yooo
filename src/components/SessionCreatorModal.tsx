import React, { useState } from 'react';
import { X, Globe, Target, Layers, ArrowRight, Loader2, Sparkles, Plus, Trash2, ShieldAlert } from 'lucide-react';

interface SessionSourceInput {
  id: string;
  targetUrl: string;
  name?: string;
  docVersion?: string;
}

interface SessionCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    targetUrl: string;
    researchObjective?: string;
    docVersion?: string;
    maxPages?: number;
    autoStartCrawl: boolean;
    sources?: Array<{ targetUrl: string; name?: string; docVersion?: string }>;
  }) => Promise<void>;
}

export const PRESET_DOCS = [
  // Frontend & UI
  {
    category: 'Frontend',
    name: 'React 19',
    url: 'https://react.dev/reference/react',
    version: '19.0.0',
    objective: 'Explore React 19 server actions, useActionState, and async transitions.',
  },
  {
    category: 'Frontend',
    name: 'Vue.js 3',
    url: 'https://vuejs.org/guide/introduction.html',
    version: '3.x',
    objective: 'Composition API, reactivity, pinia state, and template lifecycle.',
  },
  {
    category: 'Frontend',
    name: 'Tailwind CSS',
    url: 'https://tailwindcss.com/docs/installation',
    version: 'v4.0',
    objective: 'Understand CSS v4 setup, theme directives, and utility composition.',
  },
  // Backend & Runtimes
  {
    category: 'Backend',
    name: 'Node.js',
    url: 'https://nodejs.org/docs/latest/api/',
    version: 'v22.x',
    objective: 'Streams, HTTP servers, buffer encoding, and worker threads.',
  },
  {
    category: 'Backend',
    name: 'Express.js',
    url: 'https://expressjs.com/en/guide/routing.html',
    version: '4.x',
    objective: 'Middleware pipelines, router parameter matching, and error handlers.',
  },
  {
    category: 'Backend',
    name: 'Spring Boot',
    url: 'https://docs.spring.io/spring-boot/index.html',
    version: '3.x',
    objective: 'Spring Data JPA, auto-configuration, REST controllers, and security.',
  },
  {
    category: 'Backend',
    name: '.NET / C#',
    url: 'https://learn.microsoft.com/en-us/dotnet/core/introduction',
    version: '8.0',
    objective: 'ASP.NET Core Minimal APIs, Dependency Injection, and async tasks.',
  },
  {
    category: 'Backend',
    name: 'Python 3',
    url: 'https://docs.python.org/3/tutorial/index.html',
    version: '3.12',
    objective: 'Asyncio event loops, dataclasses, typing, and standard library modules.',
  },
  // Databases & Cloud
  {
    category: 'Databases',
    name: 'PostgreSQL',
    url: 'https://www.postgresql.org/docs/current/',
    version: '16',
    objective: 'Query execution plans, JSONB indexing, vacuuming, and connection limits.',
  },
  {
    category: 'Databases',
    name: 'Supabase',
    url: 'https://supabase.com/docs',
    version: 'latest',
    objective: 'PostgreSQL Row Level Security (RLS), Auth triggers, and realtime channels.',
  },
  {
    category: 'DevOps',
    name: 'Docker Docs',
    url: 'https://docs.docker.com/get-started/',
    version: 'latest',
    objective: 'Container lifecycle, compose networking, and multi-stage build caching.',
  },
  {
    category: 'DevOps',
    name: 'Kubernetes',
    url: 'https://kubernetes.io/docs/home/',
    version: 'v1.30',
    objective: 'Pod scheduling, Deployments, Services, Ingress, and ConfigMaps.',
  },
];

export const SessionCreatorModal: React.FC<SessionCreatorModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'All' | 'Frontend' | 'Backend' | 'Databases' | 'DevOps'>('All');
  const [sources, setSources] = useState<SessionSourceInput[]>([
    { id: 'src-1', targetUrl: '', name: '', docVersion: '' }
  ]);
  const [researchObjective, setResearchObjective] = useState('');
  const [maxPages, setMaxPages] = useState<number>(15);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddSourceCard = () => {
    setSources(prev => [
      ...prev,
      { id: `src-${Date.now()}-${Math.random()}`, targetUrl: '', name: '', docVersion: '' }
    ]);
  };

  const handleRemoveSourceCard = (id: string) => {
    if (sources.length <= 1) return;
    setSources(prev => prev.filter(s => s.id !== id));
  };

  const handleUpdateSource = (id: string, field: keyof SessionSourceInput, value: string) => {
    setSources(prev => prev.map(s => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const handlePresetSelect = (preset: typeof PRESET_DOCS[0]) => {
    setError(null);
    setResearchObjective(prev => prev || preset.objective);

    // If first item is empty, update it
    if (sources.length === 1 && !sources[0].targetUrl.trim()) {
      setSources([
        {
          id: sources[0].id,
          targetUrl: preset.url,
          name: preset.name,
          docVersion: preset.version,
        }
      ]);
      return;
    }

    // Check if preset already in sources
    if (sources.some(s => s.targetUrl === preset.url)) {
      return;
    }

    // Append as additional source
    setSources(prev => [
      ...prev,
      {
        id: `src-${Date.now()}-${Math.random()}`,
        targetUrl: preset.url,
        name: preset.name,
        docVersion: preset.version,
      }
    ]);
  };

  const filteredPresets = selectedCategory === 'All'
    ? PRESET_DOCS
    : PRESET_DOCS.filter(p => p.category === selectedCategory);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validSources = sources.filter(s => s.targetUrl.trim().length > 0);

    if (validSources.length === 0) {
      setError('Please provide at least one valid documentation URL');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const primary = validSources[0];

      await onSubmit({
        targetUrl: primary.targetUrl.trim(),
        researchObjective: researchObjective.trim() || undefined,
        docVersion: primary.docVersion?.trim() || undefined,
        maxPages,
        autoStartCrawl: true,
        sources: validSources.map(s => ({
          targetUrl: s.targetUrl.trim(),
          name: s.name?.trim() || undefined,
          docVersion: s.docVersion?.trim() || undefined,
        })),
      });

      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to start research session');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in zoom-in-95 duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              New Documentation Research Session
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Research single or multi-source documentation libraries (e.g. React + Next.js, Express + Node.js).
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-red-950/80 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Presets Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                Quick Presets (Click to add to session)
              </label>

              {/* Category selector */}
              <div className="flex items-center gap-1 text-[10px]">
                {(['All', 'Frontend', 'Backend', 'Databases', 'DevOps'] as const).map(cat => (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 font-medium'
                        : 'text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800/60'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1.5 bg-slate-950/40 rounded-lg border border-slate-800/60">
              {filteredPresets.map((p) => {
                const isAdded = sources.some(s => s.targetUrl === p.url);
                return (
                  <button
                    type="button"
                    key={p.name}
                    onClick={() => handlePresetSelect(p)}
                    className={`px-2.5 py-1.5 rounded-md border text-left text-xs transition-all group cursor-pointer ${
                      isAdded
                        ? 'bg-cyan-950/70 border-cyan-500 text-cyan-200'
                        : 'bg-slate-950 border-slate-800 hover:border-cyan-500/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate group-hover:text-cyan-300">
                        {p.name}
                      </span>
                      {isAdded && (
                        <span className="text-[9px] px-1 rounded bg-cyan-900/60 text-cyan-300 font-mono">Added</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">{p.version}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Multi-Source Documentation URLs Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                Documentation Sources ({sources.length})
              </label>
              <button
                type="button"
                onClick={handleAddSourceCard}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Another Source</span>
              </button>
            </div>

            <div className="space-y-3">
              {sources.map((src, index) => (
                <div
                  key={src.id}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 relative group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 font-mono">
                      Source #{index + 1} {index === 0 && <span className="text-cyan-400 font-bold">(Primary)</span>}
                    </span>
                    {sources.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSourceCard(src.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
                        title="Remove source"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <input
                      type="url"
                      required={index === 0}
                      placeholder="e.g. https://react.dev/reference/react or https://docs.python.org/3/"
                      value={src.targetUrl}
                      onChange={(e) => handleUpdateSource(src.id, 'targetUrl', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Label (e.g. React 19)"
                      value={src.name || ''}
                      onChange={(e) => handleUpdateSource(src.id, 'name', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                    <input
                      type="text"
                      placeholder="Version (e.g. 19.0.0, v22)"
                      value={src.docVersion || ''}
                      onChange={(e) => handleUpdateSource(src.id, 'docVersion', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500">
              Each documentation source is crawled concurrently within its approved domain boundaries.
            </p>
          </div>

          {/* Research Objective */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-slate-400" />
              Research Objective <span className="text-[10px] text-slate-500">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Compare authentication policies, connection pooling, and error recovery"
              value={researchObjective}
              onChange={(e) => setResearchObjective(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Max Crawl Budget */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                Crawl Budget per Source
              </label>
              <span className="font-mono text-cyan-400 font-semibold">{maxPages} pages</span>
            </div>
            <select
              value={maxPages}
              onChange={(e) => setMaxPages(parseInt(e.target.value, 10))}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              <option value={10}>10 pages per source (Fast)</option>
              <option value={15}>15 pages per source (Recommended)</option>
              <option value={25}>25 pages per source (Deep)</option>
              <option value={40}>40 pages per source (Comprehensive)</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs shadow-md shadow-cyan-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Starting Multi-Source Crawl...</span>
                </>
              ) : (
                <>
                  <span>Start Research Session</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
