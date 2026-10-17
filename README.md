# DocuMind AI
## Multi-Source Hybrid Retrieval Agent (RAG + Live Crawl)

DocuMind AI is an enterprise-grade AI technical documentation research assistant built exclusively in TypeScript and JavaScript. It accepts any documentation URL, discovers internal navigation hierarchies, performs priority-based multi-page crawling, maps documentation structures, generates semantic vector and full-text indexes, and answers complex technical questions using hybrid retrieval (pgvector + FTS + Reciprocal Rank Fusion) with verified source citations.

---

## 🌟 Key Features

1. **Intelligent Documentation Crawler**:
   - Priority-based crawl queue prioritizing API references, tutorials, quickstarts, and configuration guides.
   - Sitemap.xml auto-discovery and robots.txt compliance.
   - Concurrency limits, exponential backoff retries, and strict domain boundaries.
   - SSRF protection: blocks private, loopback, and link-local IP addresses.

2. **Structure-Aware Content Extraction**:
   - Powered by Cheerio.
   - Strips ads, modals, navigation bars, and footers.
   - Preserves code blocks, function signatures, parameter tables, and explanatory context together.

3. **Temporary Vector & Keyword Indexing**:
   - Dual-mode architecture: connects to PostgreSQL with pgvector extension or runs high-performance embedded pgvector-compatible hybrid engine out-of-the-box.
   - Generates 768-dimensional embeddings using Gemini (`gemini-embedding-2-preview`).
   - PostgreSQL Full-Text Search (`tsvector` & `ts_rank_cd`) alongside cosine vector similarity (`<=>`).

4. **Multi-Source Hybrid Retrieval (RRF + Targeted Live Crawl)**:
   - **Semantic retrieval** via pgvector.
   - **Keyword retrieval** via Full-Text Search.
   - Combined via **Reciprocal Rank Fusion (RRF)**: `RRF = 1/(60 + r_sem) + 1/(60 + r_kw)`.
   - **Targeted Live Crawling**: Automatically detects when existing evidence is insufficient and crawls candidate pages on the fly.

5. **Evidence-Grounded AI Research Assistant**:
   - Powered by Gemini 3.8 Flash (`gemini-3.8-flash`).
   - Answers strictly grounded in retrieved `<evidence>` blocks.
   - Verified inline citations with page titles, section headings, and direct links.
   - Safe prompt-injection sanitization.

6. **Developer Workspace Interface**:
   - **Documentation Explorer**: Interactive tree hierarchy, word counts, and page inspector modal.
   - **AI Research Chat**: Markdown formatting, syntax-highlighted code blocks with 1-click copy, and inline citation pills.
   - **Research Sources & Evidence Inspector**: Real-time RRF scores, retrieval method badges, and research report export.

---

## 🚀 Quick Start & Installation

### Prerequisites
- Node.js 20+
- npm or pnpm
- (Optional) PostgreSQL 15+ with pgvector (included in `docker-compose.yml`)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Set your `GEMINI_API_KEY`:
```env
GEMINI_API_KEY="your-gemini-api-key"
PORT=3000

# Optional PostgreSQL with pgvector:
# If left empty, DocuMind AI runs the built-in embedded pgvector hybrid engine
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/documind"
```

### 3. (Optional) Run with Docker Compose
To launch PostgreSQL with the `pgvector` extension and the app:
```bash
docker compose up -d
```

### 4. Development Server
Run full-stack Express + Vite:
```bash
npm run dev
```
Open your browser at `http://localhost:3000`.

### 5. Automated Tests
Run unit tests with Vitest:
```bash
npm run test
```

---

## 📡 REST API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/research/sessions` | `POST` | Create a new research session |
| `/api/research/sessions` | `GET` | List recent research sessions |
| `/api/research/sessions/:id` | `GET` | Get session details |
| `/api/research/sessions/:id/crawl` | `POST` | Trigger background crawl & indexing |
| `/api/research/sessions/:id/pages` | `GET` | List discovered pages & hierarchy |
| `/api/research/sessions/:id/progress` | `GET` | Get crawling and indexing progress |
| `/api/research/sessions/:id/stream` | `GET` | Server-Sent Events (SSE) live progress stream |
| `/api/research/sessions/:id/chat` | `POST` | Submit technical question & get grounded answer |
| `/api/research/sessions/:id/sources` | `GET` | Inspect retrieved sources and index stats |
| `/api/research/sessions/:id/refresh` | `POST` | Re-crawl and re-index specific documentation page |
| `/api/research/sessions/:id` | `DELETE` | Delete session and temporary vector index |

---

## 🔒 Security & Sandboxing

- **SSRF Defense**: Validates all URLs against private RFC1918 subnets, AWS/GCP metadata endpoints (`169.254.169.254`), and loopback IPs.
- **Approved Domain Boundary**: Restricts all link traversal strictly to the target documentation domain.
- **Prompt Injection Defense**: Sanitizes crawled text, strips control characters, and enforces strict boundary tags.
- **No Python Runtime**: Built 100% in TypeScript and JavaScript.
- **Automatic Expiration**: Temporary research sessions and vector data auto-expire after 24 hours.
