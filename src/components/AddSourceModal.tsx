import React, { useState } from 'react';
import { X, Globe, Plus, Layers, Loader2, Sparkles, Server, Database, Code2 } from 'lucide-react';
import { PRESET_DOCS } from './SessionCreatorModal';

interface AddSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    targetUrl: string;
    name?: string;
    docVersion?: string;
    maxPages?: number;
  }) => Promise<void>;
  existingDomains?: string[];
}

export const AddSourceModal: React.FC<AddSourceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  existingDomains = [],
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'All' | 'Frontend' | 'Backend' | 'Databases' | 'DevOps'>('All');
  const [targetUrl, setTargetUrl] = useState('');
  const [name, setName] = useState('');
  const [docVersion, setDocVersion] = useState('');
  const [maxPages, setMaxPages] = useState<number>(15);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePresetSelect = (preset: typeof PRESET_DOCS[0]) => {
    setTargetUrl(preset.url);
    setName(preset.name);
    setDocVersion(preset.version);
    setError(null);
  };

  const filteredPresets = selectedCategory === 'All'
    ? PRESET_DOCS
    : PRESET_DOCS.filter(p => p.category === selectedCategory);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl.trim()) {
      setError('Please enter a valid documentation URL');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit({
        targetUrl: targetUrl.trim(),
        name: name.trim() || undefined,
        docVersion: docVersion.trim() || undefined,
        maxPages,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add documentation source');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-sm shadow-cyan-600/30">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                Add Documentation Source to Session
              </h2>
              <p className="text-[11px] text-slate-400">
                Research across multiple documentation websites concurrently in this session
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <span className="font-semibold">Error:</span> {error}
            </div>
          )}

          {/* Quick Preset Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Quick Documentation Presets
              </label>
              {/* Category Filter */}
              <div className="flex gap-1 text-[10px]">
                {(['All', 'Frontend', 'Backend', 'Databases', 'DevOps'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                      selectedCategory === cat
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-1 bg-slate-950/40 rounded-lg border border-slate-800/80">
              {filteredPresets.map((preset) => {
                const isSelected = targetUrl === preset.url;
                const isExisting = existingDomains.some(d => preset.url.includes(d));
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handlePresetSelect(preset)}
                    className={`p-2 rounded border text-left transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="text-xs font-semibold truncate flex items-center justify-between">
                      <span>{preset.name}</span>
                      {isExisting && (
                        <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-400">Added</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">{preset.version}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target Documentation URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-cyan-400" /> Additional Documentation Root URL
            </label>
            <input
              type="url"
              required
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="e.g. https://docs.python.org/3/ or https://expressjs.com/en/guide/"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <p className="text-[10px] text-slate-500">
              Crawl respects robots.txt and remains scoped within this documentation domain. Private IP / localhost addresses are rejected.
            </p>
          </div>

          {/* Name & Version Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Source Label (Optional)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Python Standard Library"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Documentation Version (Optional)
              </label>
              <input
                type="text"
                value={docVersion}
                onChange={(e) => setDocVersion(e.target.value)}
                placeholder="e.g. 3.12, v4.x, latest"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          {/* Crawl Page Limit */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label className="font-medium text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" /> Max Pages for this Source
              </label>
              <span className="font-mono text-cyan-400 font-semibold">{maxPages} pages</span>
            </div>
            <input
              type="range"
              min="3"
              max="40"
              step="1"
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>3 pages (Rapid)</span>
              <span>15 pages (Recommended)</span>
              <span>40 pages (Comprehensive)</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs shadow-md shadow-cyan-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Queuing Crawl...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Source & Crawl</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
