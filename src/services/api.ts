import { ResearchSession, DocPage, ChatMessage, CrawlProgressEvent, EvaluationTestCase, EvaluationSummary } from '../types';

function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // When running in AI Studio preview (*.run.app), localhost, or Google Cloud environments,
    // always use same-origin relative /api so requests go to the active full-stack server
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.run.app') ||
      hostname.endsWith('.google.com') ||
      !hostname.includes('.')
    ) {
      return '';
    }
  }

  // When deployed on external static host (such as Netlify), use configured backend URL if present
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured && typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/+$/, '');
  }

  return '';
}

let currentApiBase = getApiBase();

/**
 * Resilient fetch wrapper with automatic local-backend fallback
 * if an external URL fails or times out (prevents "Load failed" / CORS errors)
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${currentApiBase}${path}`;
  try {
    const res = await fetch(url, init);
    return res;
  } catch (err: any) {
    // If an external configured API base failed, automatically fallback to same-origin path
    if (currentApiBase !== '') {
      console.warn(`[API] Connection to ${currentApiBase} failed (${err.message}). Falling back to local backend.`);
      currentApiBase = '';
      return fetch(path, init);
    }
    throw err;
  }
}

export const api = {
  async getSessions(): Promise<ResearchSession[]> {
    const res = await apiFetch('/api/research/sessions');
    if (!res.ok) throw new Error('Failed to load sessions');
    return res.json();
  },

  async getSession(id: string): Promise<ResearchSession> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Failed to load session');
    return res.json();
  },

  async createSession(data: {
    targetUrl: string;
    researchObjective?: string;
    docVersion?: string;
    autoStartCrawl?: boolean;
    maxPages?: number;
    sources?: Array<{ targetUrl: string; name?: string; docVersion?: string }>;
  }): Promise<ResearchSession> {
    const res = await apiFetch('/api/research/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create session');
    }
    return res.json();
  },

  async startCrawl(sessionId: string, options?: { maxPages?: number; maxDepth?: number; docVersion?: string }): Promise<void> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to start crawl');
    }
  },

  async addSource(sessionId: string, data: { targetUrl: string; name?: string; docVersion?: string; maxPages?: number }): Promise<any> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add documentation source');
    }
    return res.json();
  },

  async getPages(sessionId: string): Promise<DocPage[]> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/pages`);
    if (!res.ok) throw new Error('Failed to load pages');
    return res.json();
  },

  async getChatHistory(sessionId: string): Promise<ChatMessage[]> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/chat`);
    if (!res.ok) throw new Error('Failed to load chat');
    return res.json();
  },

  async sendQuestion(sessionId: string, question: string, docVersion?: string): Promise<ChatMessage> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, docVersion }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to submit question');
    }
    return res.json();
  },

  async refreshPage(sessionId: string, url: string): Promise<void> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to refresh page');
    }
  },

  async deleteSession(sessionId: string): Promise<{ message: string }> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete session and temporary index');
    }
    return res.json();
  },

  async getEvaluations(sessionId: string): Promise<{ tests: EvaluationTestCase[]; summary: EvaluationSummary }> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/evaluations`);
    if (!res.ok) throw new Error('Failed to load evaluation tests');
    return res.json();
  },

  async runQuickEvaluation(sessionId: string): Promise<{ tests: EvaluationTestCase[]; summary: EvaluationSummary; message: string }> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/evaluations/quick`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to run quick evaluation');
    }
    return res.json();
  },

  async createGroundTruthEvaluation(sessionId: string, data: {
    question: string;
    expectedUrls?: string[];
    expectedKeywords?: string[];
    expectedHeading?: string;
    topK?: number;
  }): Promise<{ test: EvaluationTestCase; summary: EvaluationSummary }> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/evaluations/ground-truth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create ground-truth test');
    }
    return res.json();
  },

  async rerunEvaluation(sessionId: string, testId: string): Promise<{ test: EvaluationTestCase; summary: EvaluationSummary }> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/evaluations/${encodeURIComponent(testId)}/rerun`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to rerun test');
    return res.json();
  },

  async runAllEvaluations(sessionId: string): Promise<{ tests: EvaluationTestCase[]; summary: EvaluationSummary }> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/evaluations/run-all`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to rerun evaluations');
    return res.json();
  },

  async deleteEvaluation(sessionId: string, testId: string): Promise<any> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/evaluations/${encodeURIComponent(testId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete test');
    return res.json();
  },

  async clearEvaluations(sessionId: string): Promise<any> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/evaluations`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to clear evaluations');
    return res.json();
  },

  async retryPage(sessionId: string, pageId: string): Promise<any> {
    const res = await apiFetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/pages/${encodeURIComponent(pageId)}/retry`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to retry page crawl');
    }
    return res.json();
  },

  subscribeToProgress(sessionId: string, onEvent: (event: CrawlProgressEvent) => void): () => void {
    const streamUrl = `${currentApiBase}/api/research/sessions/${encodeURIComponent(sessionId)}/stream`;
    let eventSource: EventSource;
    try {
      eventSource = new EventSource(streamUrl);
    } catch {
      eventSource = new EventSource(`/api/research/sessions/${encodeURIComponent(sessionId)}/stream`);
    }

    eventSource.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        onEvent(parsed);
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    eventSource.onerror = () => {
      if (currentApiBase !== '') {
        console.warn('[SSE] EventSource failed on external backend, falling back to local');
        currentApiBase = '';
        eventSource.close();
        const fallbackSource = new EventSource(`/api/research/sessions/${encodeURIComponent(sessionId)}/stream`);
        fallbackSource.onmessage = eventSource.onmessage;
      }
    };

    return () => {
      eventSource.close();
    };
  },
};
