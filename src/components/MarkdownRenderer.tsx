import React, { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onCitationClick?: (url: string) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, onCitationClick }) => {
  // Simple, robust markdown block parser
  const renderBlocks = () => {
    const lines = content.split('\n');
    const blocks: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Code blocks (```lang ... ```)
      if (line.trim().startsWith('```')) {
        const langMatch = line.trim().match(/^```([a-zA-Z0-9_-]*)/);
        const lang = langMatch ? langMatch[1] : '';
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        blocks.push(
          <CodeBlock key={`code-${i}`} code={codeLines.join('\n')} language={lang} />
        );
        continue;
      }

      // Headings
      if (line.startsWith('### ')) {
        blocks.push(
          <h3 key={`h3-${i}`} className="text-base font-semibold text-cyan-300 mt-4 mb-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            {renderInline(line.replace('### ', ''))}
          </h3>
        );
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        blocks.push(
          <h2 key={`h2-${i}`} className="text-lg font-bold text-slate-100 mt-5 mb-2 pb-1 border-b border-slate-800">
            {renderInline(line.replace('## ', ''))}
          </h2>
        );
        i++;
        continue;
      }
      if (line.startsWith('# ')) {
        blocks.push(
          <h1 key={`h1-${i}`} className="text-xl font-bold text-white mt-6 mb-3">
            {renderInline(line.replace('# ', ''))}
          </h1>
        );
        i++;
        continue;
      }

      // Blockquote
      if (line.startsWith('> ')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].startsWith('> ')) {
          quoteLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        blocks.push(
          <blockquote key={`quote-${i}`} className="border-l-2 border-cyan-500/60 bg-slate-900/50 pl-3.5 py-1.5 my-2.5 text-xs text-slate-300 italic rounded-r">
            {quoteLines.map((ql, qidx) => (
              <p key={qidx} className="my-0.5">{renderInline(ql)}</p>
            ))}
          </blockquote>
        );
        continue;
      }

      // Table detection (| col | col |)
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }
        blocks.push(<TableBlock key={`table-${i}`} lines={tableLines} />);
        continue;
      }

      // Bullet lists (- or *)
      if (/^[-*]\s+/.test(line)) {
        const listItems: string[] = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
          listItems.push(lines[i].replace(/^[-*]\s+/, ''));
          i++;
        }
        blocks.push(
          <ul key={`ul-${i}`} className="my-2 space-y-1 list-none pl-1">
            {listItems.map((item, lIdx) => (
              <li key={lIdx} className="text-xs text-slate-300 flex items-start gap-2">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>{renderInline(item)}</span>
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Numbered lists (1. 2.)
      if (/^\d+\.\s+/.test(line)) {
        const listItems: string[] = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          listItems.push(lines[i].replace(/^\d+\.\s+/, ''));
          i++;
        }
        blocks.push(
          <ol key={`ol-${i}`} className="my-2 space-y-1 list-decimal list-inside pl-1 text-xs text-slate-300">
            {listItems.map((item, lIdx) => (
              <li key={lIdx} className="text-xs text-slate-300">
                {renderInline(item)}
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // Empty line
      if (!line.trim()) {
        i++;
        continue;
      }

      // Regular paragraph
      blocks.push(
        <p key={`p-${i}`} className="my-2 text-xs leading-relaxed text-slate-300">
          {renderInline(line)}
        </p>
      );
      i++;
    }

    return blocks;
  };

  // Render inline formatting: **bold**, `code`, [link](url)
  const renderInline = (text: string): React.ReactNode => {
    // Regex for inline elements
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      const matchStr = match[0];
      if (matchStr.startsWith('**') && matchStr.endsWith('**')) {
        parts.push(
          <strong key={match.index} className="font-semibold text-slate-100">
            {matchStr.slice(2, -2)}
          </strong>
        );
      } else if (matchStr.startsWith('`') && matchStr.endsWith('`')) {
        parts.push(
          <code key={match.index} className="px-1 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-[11px] border border-slate-700/60">
            {matchStr.slice(1, -1)}
          </code>
        );
      } else if (matchStr.startsWith('[') && matchStr.includes('](')) {
        const label = matchStr.substring(1, matchStr.indexOf(']('));
        const url = matchStr.substring(matchStr.indexOf('](') + 2, matchStr.length - 1);
        parts.push(
          <a
            key={match.index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (onCitationClick) {
                e.preventDefault();
                onCitationClick(url);
              }
            }}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-cyan-950/60 text-cyan-300 border border-cyan-800/60 hover:bg-cyan-900/60 transition-colors"
          >
            {label}
            <ExternalLink className="w-2.5 h-2.5 ml-0.5 inline opacity-70" />
          </a>
        );
      }

      lastIndex = match.index + matchStr.length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  return <div className="space-y-1">{renderBlocks()}</div>;
};

const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-md border border-slate-800 bg-slate-950/80 overflow-hidden text-xs font-mono shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800/80 text-[11px] text-slate-400">
        <span className="uppercase tracking-wider font-semibold text-slate-400">
          {language || 'text'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 text-[10px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="text-[10px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3 overflow-x-auto text-slate-200 leading-relaxed font-mono text-[11px]">
        <pre><code>{code}</code></pre>
      </div>
    </div>
  );
};

const TableBlock: React.FC<{ lines: string[] }> = ({ lines }) => {
  if (lines.length < 2) return null;

  const parseRow = (line: string) => {
    return line
      .split('|')
      .slice(1, -1)
      .map(c => c.trim());
  };

  const headers = parseRow(lines[0]);
  // line 1 is usually separator (|---|---|)
  const rows = lines.slice(2).map(parseRow);

  return (
    <div className="my-3 overflow-x-auto rounded border border-slate-800">
      <table className="w-full text-left text-xs text-slate-300">
        <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-200 font-semibold text-[11px]">
          <tr>
            {headers.map((h, idx) => (
              <th key={idx} className="px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-slate-900/30">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="px-3 py-1.5 text-[11px]">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
