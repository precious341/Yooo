import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Target,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  Search,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Check,
} from 'lucide-react';
import { ResearchSession, DocPage, EvaluationTestCase, EvaluationSummary } from '../types';
import { api } from '../services/api';

interface EvaluationDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: ResearchSession | null;
  pages: DocPage[];
  onSelectPage?: (page: DocPage) => void;
}

export const EvaluationDashboardModal: React.FC<EvaluationDashboardModalProps> = ({
  isOpen,
  onClose,
  session,
  pages,
  onSelectPage,
}) => {
  const [tests, setTests] = useState<EvaluationTestCase[]>([]);
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'ground_truth' | 'exploratory'>('all');
  const [expandedTestIds, setExpandedTestIds] = useState<Record<string, boolean>>({});

  // Form states for creating Ground-Truth test
  const [question, setQuestion] = useState('');
  const [expectedUrl, setExpectedUrl] = useState('');
  const [expectedHeading, setExpectedHeading] = useState('');
  const [expectedKeywords, setExpectedKeywords] = useState('');
  const [topK, setTopK] = useState(5);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load evaluations when opened
  useEffect(() => {
    if (!isOpen || !session) return;
    loadEvaluations();
  }, [isOpen, session]);

  const loadEvaluations = async () => {
    if (!session) return;
    setIsLoading(true);
    try {
      const data = await api.getEvaluations(session.id);
      setTests(data.tests);
      setSummary(data.summary);
      // Default expand first test if exists
      if (data.tests.length > 0) {
        setExpandedTestIds(prev => ({ ...prev, [data.tests[0].id]: true }));
      }
    } catch (err: any) {
      console.error('Failed to load evaluations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunQuickSuite = async () => {
    if (!session) return;
    setIsGenerating(true);
    try {
      const data = await api.runQuickEvaluation(session.id);
      setTests(data.tests);
      setSummary(data.summary);
      if (data.tests.length > 0) {
        setExpandedTestIds(prev => ({ ...prev, [data.tests[0].id]: true }));
      }
    } catch (err: any) {
      alert(err.message || 'Failed to run quick evaluation suite');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateGroundTruth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !question.trim()) return;

    setIsSubmitting(true);
    setFormError(null);

    const urls = expectedUrl.split(',').map(u => u.trim()).filter(Boolean);
    const keywords = expectedKeywords.split(',').map(k => k.trim()).filter(Boolean);

    try {
      const data = await api.createGroundTruthEvaluation(session.id, {
        question: question.trim(),
        expectedUrls: urls,
        expectedKeywords: keywords,
        expectedHeading: expectedHeading.trim() || undefined,
        topK,
      });

      setTests(prev => [data.test, ...prev]);
      setSummary(data.summary);
      setExpandedTestIds(prev => ({ ...prev, [data.test.id]: true }));
      // Reset form
      setQuestion('');
      setExpectedUrl('');
      setExpectedHeading('');
      setExpectedKeywords('');
      setIsFormOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to execute ground-truth evaluation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRerunTest = async (testId: string) => {
    if (!session) return;
    try {
      const data = await api.rerunEvaluation(session.id, testId);
      setTests(prev => prev.map(t => (t.id === testId ? data.test : t)));
      setSummary(data.summary);
    } catch (err: any) {
      alert(err.message || 'Failed to rerun test');
    }
  };

  const handleRerunAll = async () => {
    if (!session || tests.length === 0) return;
    setIsLoading(true);
    try {
      const data = await api.runAllEvaluations(session.id);
      setTests(data.tests);
      setSummary(data.summary);
    } catch (err: any) {
      alert(err.message || 'Failed to rerun evaluations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTest = async (testId: string) => {
    if (!session) return;
    try {
      const data = await api.deleteEvaluation(session.id, testId);
      setTests(prev => prev.filter(t => t.id !== testId));
      setSummary(data.summary);
    } catch (err: any) {
      alert(err.message || 'Failed to delete evaluation test');
    }
  };

  const handleClearAll = async () => {
    if (!session || tests.length === 0) return;
    if (!confirm('Are you sure you want to clear all evaluation benchmarks for this session?')) return;
    try {
      const data = await api.clearEvaluations(session.id);
      setTests([]);
      setSummary(data.summary);
    } catch (err: any) {
      alert(err.message || 'Failed to clear evaluations');
    }
  };

  const toggleTestExpand = (id: string) => {
    setExpandedTestIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (!isOpen) return null;

  const filteredTests = tests.filter(t => {
    if (filterMode === 'ground_truth') return t.isGroundTruth;
    if (filterMode === 'exploratory') return !t.isGroundTruth;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">Research Quality Evaluation</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Hybrid RAG Benchmark
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Measures Precision@K, Recall@K, and MRR against the actual PostgreSQL & pgvector retrieval pipeline
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Tests ({tests.length})
            </button>
            <button
              onClick={() => setFilterMode('ground_truth')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                filterMode === 'ground_truth'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Target className="w-3 h-3 text-emerald-400" />
              <span>Ground Truth ({summary?.groundTruthCount || 0})</span>
            </button>
            <button
              onClick={() => setFilterMode('exploratory')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                filterMode === 'exploratory'
                  ? 'bg-blue-950 text-blue-300 border border-blue-800'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-blue-400" />
              <span>Exploratory ({summary?.exploratoryCount || 0})</span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunQuickSuite}
              disabled={isGenerating || pages.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="Automatically generate candidate test questions from indexed documentation"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'Evaluating Suite...' : 'Run Quick Evaluation'}</span>
            </button>

            <button
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 border border-emerald-700/80 font-medium text-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isFormOpen ? 'Close Form' : 'New Ground-Truth Test'}</span>
            </button>

            {tests.length > 0 && (
              <>
                <button
                  onClick={handleRerunAll}
                  disabled={isLoading}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs transition-colors cursor-pointer disabled:opacity-50"
                  title="Rerun all tests against current hybrid index"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
                  <span className="hidden sm:inline">Rerun All</span>
                </button>

                <button
                  onClick={handleClearAll}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
                  title="Clear all evaluation tests"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Collapsible Ground-Truth Creator Form */}
        {isFormOpen && (
          <form
            onSubmit={handleCreateGroundTruth}
            className="p-4 bg-slate-950/70 border-b border-slate-800 space-y-3 animate-in slide-in-from-top-2 duration-150"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <Target className="w-4 h-4 text-emerald-400" />
                <span>Create Ground-Truth Evaluation Benchmark</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Real Precision@K & MRR will be calculated using these relevance labels
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2 space-y-1">
                <label className="text-[11px] font-medium text-slate-300">
                  Test Question <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. How do I configure state management with useState in React?"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-300">
                  Expected Documentation URL(s)
                </label>
                <input
                  type="text"
                  placeholder="https://react.dev/reference/react/useState (comma separated for multiple)"
                  value={expectedUrl}
                  onChange={e => setExpectedUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
                {pages.length > 0 && (
                  <div className="flex items-center gap-1 overflow-x-auto pt-1">
                    <span className="text-[9px] text-slate-500 shrink-0">Quick pick:</span>
                    {pages.slice(0, 3).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setExpectedUrl(p.url)}
                        className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 hover:text-cyan-300 truncate max-w-[150px] cursor-pointer"
                        title={p.url}
                      >
                        {p.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-300">
                  Expected Section Heading or Key Terms
                </label>
                <input
                  type="text"
                  placeholder="e.g. useState, Parameters, Basic Usage"
                  value={expectedHeading}
                  onChange={e => setExpectedHeading(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-300">
                  Expected Keywords (Conjunction fallback)
                </label>
                <input
                  type="text"
                  placeholder="e.g. initial state, dispatch, set"
                  value={expectedKeywords}
                  onChange={e => setExpectedKeywords(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-300">
                  Top-K Passages to Evaluate
                </label>
                <select
                  value={topK}
                  onChange={e => setTopK(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value={3}>K = 3 passages</option>
                  <option value={5}>K = 5 passages (Standard)</option>
                  <option value={8}>K = 8 passages</option>
                  <option value={10}>K = 10 passages</option>
                </select>
              </div>
            </div>

            {formError && (
              <p className="text-xs text-rose-400 bg-rose-950/60 p-2 rounded border border-rose-900/60 font-mono">
                {formError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !question.trim()}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Evaluating...' : 'Run Benchmark & Measure Metrics'}
              </button>
            </div>
          </form>
        )}

        {/* Metrics Summary Strip */}
        {summary && summary.totalTests > 0 && (
          <div className="p-4 bg-slate-950/80 border-b border-slate-800 space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {/* Total Tests */}
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono uppercase block">Total Tests</span>
                <div className="text-base font-bold text-white font-mono mt-0.5">
                  {summary.totalTests}
                  <span className="text-[11px] font-normal text-emerald-400 ml-1.5">
                    ({summary.executedCount} passed)
                  </span>
                </div>
              </div>

              {/* Latency */}
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono uppercase block">Avg Latency</span>
                <div className="text-base font-bold text-cyan-300 font-mono mt-0.5">
                  {summary.averageLatencyMs} <span className="text-xs text-slate-400 font-normal">ms</span>
                </div>
              </div>

              {/* Precision@K (Calculated ONLY for ground truth) */}
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono uppercase block">Precision@K</span>
                <div className="text-base font-bold font-mono mt-0.5">
                  {summary.hasGroundTruthMetrics && summary.meanPrecisionAtK !== undefined ? (
                    <span className="text-emerald-400">
                      {(summary.meanPrecisionAtK * 100).toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 font-normal italic">
                      Needs Ground Truth
                    </span>
                  )}
                </div>
              </div>

              {/* Recall@K (Calculated ONLY for ground truth) */}
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono uppercase block">Recall@K</span>
                <div className="text-base font-bold font-mono mt-0.5">
                  {summary.hasGroundTruthMetrics && summary.meanRecallAtK !== undefined ? (
                    <span className="text-emerald-400">
                      {(summary.meanRecallAtK * 100).toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 font-normal italic">
                      Needs Ground Truth
                    </span>
                  )}
                </div>
              </div>

              {/* Mean Reciprocal Rank (MRR) */}
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono uppercase block">MRR Score</span>
                <div className="text-base font-bold font-mono mt-0.5">
                  {summary.hasGroundTruthMetrics && summary.meanReciprocalRank !== undefined ? (
                    <span className="text-cyan-400">
                      {summary.meanReciprocalRank.toFixed(3)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 font-normal italic">
                      Needs Ground Truth
                    </span>
                  )}
                </div>
              </div>

              {/* Suite Composition */}
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono uppercase block">Suite Type</span>
                <div className="text-xs font-mono text-slate-300 mt-1 space-y-0.5">
                  <div className="text-emerald-400">{summary.groundTruthCount} Ground Truth</div>
                  <div className="text-blue-400">{summary.exploratoryCount} Exploratory</div>
                </div>
              </div>
            </div>

            {/* Scientific Truthfulness Notice */}
            {!summary.hasGroundTruthMetrics && (
              <div className="px-3 py-1.5 rounded-lg bg-blue-950/40 border border-blue-900/60 text-[11px] text-blue-300 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 shrink-0 text-blue-400" />
                <span>
                  Exploratory evaluation active: Precision@K and MRR are computed exclusively when verified ground-truth relevance labels are defined.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Test List Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && tests.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-cyan-400" />
              <p className="text-xs text-slate-400">Benchmarking hybrid retrieval pipeline...</p>
            </div>
          ) : filteredTests.length === 0 ? (
            /* Empty State */
            <div className="py-12 px-4 text-center max-w-lg mx-auto space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-cyan-400 shadow-xl">
                <Target className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-sm font-bold text-white">No Evaluation Tests Executed Yet</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Run a Quick Evaluation Suite to automatically test questions derived from indexed documentation headings, or create Ground-Truth Benchmarks with expected pages to calculate verified Precision@K, Recall@K, and Mean Reciprocal Rank.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                <button
                  onClick={handleRunQuickSuite}
                  disabled={isGenerating || pages.length === 0}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Run Quick Evaluation Suite</span>
                </button>
                <button
                  onClick={() => setIsFormOpen(true)}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span>Create Ground-Truth Test</span>
                </button>
              </div>
            </div>
          ) : (
            filteredTests.map((test, index) => {
              const isExpanded = expandedTestIds[test.id] !== false;

              return (
                <div
                  key={test.id}
                  className="bg-slate-950/60 border border-slate-800/80 rounded-xl overflow-hidden transition-all hover:border-slate-700/90"
                >
                  {/* Test Header Row */}
                  <div
                    onClick={() => toggleTestExpand(test.id)}
                    className="p-3.5 flex items-start justify-between gap-3 cursor-pointer select-none bg-slate-900/40 hover:bg-slate-900/70 transition-colors"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono text-slate-500">#{index + 1}</span>

                        {/* Test Type Badge */}
                        {test.isGroundTruth ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                            <Target className="w-3 h-3 text-emerald-400" />
                            Ground-Truth Benchmark
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-blue-400" />
                            Exploratory Test
                          </span>
                        )}

                        {/* Latency */}
                        {test.latencyMs !== undefined && (
                          <span className="flex items-center gap-1 text-[10px] text-cyan-400 font-mono">
                            <Clock className="w-3 h-3" />
                            {test.latencyMs} ms
                          </span>
                        )}

                        {/* Route / Method */}
                        {test.retrievalMethod && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-800 font-mono">
                            Route: {test.retrievalMethod}
                          </span>
                        )}

                        {/* Ground Truth Metric Badges */}
                        {test.isGroundTruth && test.precisionAtK !== undefined && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-950/90 text-emerald-300 border border-emerald-800">
                            P@{test.topK || 5}: {(test.precisionAtK * 100).toFixed(0)}%
                          </span>
                        )}

                        {test.isGroundTruth && test.reciprocalRank !== undefined && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-950/90 text-cyan-300 border border-cyan-800">
                            RR: {test.reciprocalRank.toFixed(3)}
                          </span>
                        )}
                      </div>

                      <h4 className="text-xs font-semibold text-white tracking-wide">
                        {test.question}
                      </h4>

                      {/* Expected Ground Truth info */}
                      {test.isGroundTruth && (
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 flex-wrap">
                          {test.expectedUrls && test.expectedUrls.length > 0 && (
                            <span>Target: {test.expectedUrls.join(', ')}</span>
                          )}
                          {test.expectedHeading && <span>Heading: &quot;{test.expectedHeading}&quot;</span>}
                          {test.expectedKeywords && test.expectedKeywords.length > 0 && (
                            <span>Keywords: {test.expectedKeywords.join(', ')}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right side controls */}
                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleRerunTest(test.id)}
                        className="p-1 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Rerun this single evaluation"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTest(test.id)}
                        className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Delete test"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleTestExpand(test.id)}
                        className="p-1 text-slate-400 hover:text-white"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Retrieved Passages Detail */}
                  {isExpanded && (
                    <div className="p-3.5 border-t border-slate-800/80 bg-slate-950/40 space-y-3">
                      {test.status === 'failed' ? (
                        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-900/60 text-xs text-rose-300 font-mono">
                          Retrieval Failure: {test.errorMessage || 'Execution encountered an unexpected error.'}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span className="font-semibold text-slate-300">
                              Top {test.retrievedItems.length} Retrieved Documentation Passages
                            </span>
                            {test.isGroundTruth && (
                              <span className="text-emerald-400 font-mono">
                                {test.relevantRetrievedCount || 0} of {test.retrievedItems.length} relevant (
                                {test.expectedFound ? 'Ground truth retrieved' : 'Ground truth missed'}
                                )
                              </span>
                            )}
                          </div>

                          <div className="space-y-2">
                            {test.retrievedItems.map((item, pIdx) => {
                              return (
                                <div
                                  key={pIdx}
                                  className={`p-3 rounded-lg border transition-all text-xs ${
                                    item.isRelevant
                                      ? 'bg-emerald-950/30 border-emerald-800/70'
                                      : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px] flex items-center justify-center shrink-0">
                                        #{pIdx + 1}
                                      </span>

                                      {/* Relevance pill */}
                                      {test.isGroundTruth && (
                                        <span
                                          className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-medium flex items-center gap-1 ${
                                            item.isRelevant
                                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                                          }`}
                                        >
                                          {item.isRelevant ? (
                                            <>
                                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                              Relevant Match
                                            </>
                                          ) : (
                                            <>
                                              <HelpCircle className="w-2.5 h-2.5" />
                                              Candidate Passage
                                            </>
                                          )}
                                        </span>
                                      )}

                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-medium text-cyan-300 hover:text-cyan-200 hover:underline truncate flex items-center gap-1 font-mono text-[11px]"
                                      >
                                        <span>{item.pageTitle}</span>
                                        <ExternalLink className="w-2.5 h-2.5 opacity-70 shrink-0" />
                                      </a>

                                      {item.heading && (
                                        <span className="text-[10px] text-slate-400 font-mono truncate">
                                          § {item.heading}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono">
                                      <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400">
                                        {item.retrievalMethod}
                                      </span>
                                      <span className="text-cyan-400">Score: {item.score}</span>
                                    </div>
                                  </div>

                                  {/* Supporting excerpt */}
                                  <p className="mt-2 text-slate-300 font-mono text-[11px] leading-relaxed bg-slate-950/60 p-2 rounded border border-slate-900 line-clamp-3">
                                    {item.excerpt}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span>Active Session: {session?.rootDomain}</span>
            <span>•</span>
            <span>Indexed Chunks Evaluated: {session?.pagesIndexed || 0} pages</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
          >
            Close Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
