import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, Network, Search, ExternalLink, Globe, Eye, ZoomIn, ZoomOut, RotateCcw, Filter, Layers } from 'lucide-react';
import { DocPage } from '../types';

interface KnowledgeGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: DocPage[];
  onSelectPage: (page: DocPage) => void;
}

interface GraphNode {
  id: string;
  url: string;
  title: string;
  domain: string;
  headingsCount: number;
  wordCount: number;
  depth: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  page: DocPage;
}

interface GraphEdge {
  sourceId: string;
  targetId: string;
  sourceUrl: string;
  targetUrl: string;
}

const DOMAIN_COLORS = [
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // purple-500
  '#ec4899', // pink-500
];

export const KnowledgeGraphModal: React.FC<KnowledgeGraphModalProps> = ({
  isOpen,
  onClose,
  pages,
  onSelectPage,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Extract unique domains
  const uniqueDomains = useMemo(() => {
    return Array.from(
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
  }, [pages]);

  const domainColorMap = useMemo(() => {
    const map = new Map<string, string>();
    uniqueDomains.forEach((dom, idx) => {
      map.set(dom, DOMAIN_COLORS[idx % DOMAIN_COLORS.length]);
    });
    return map;
  }, [uniqueDomains]);

  // Construct Nodes and Edges based on verified internal links
  const { nodes, edges } = useMemo(() => {
    const filtered = pages.filter((p) => {
      const dom = p.sourceDomain || (() => {
        try { return new URL(p.url).hostname; } catch { return 'docs'; }
      })();
      const matchesDomain = domainFilter === 'all' || dom === domainFilter;
      const matchesSearch =
        searchTerm === '' ||
        p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.url.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesDomain && matchesSearch;
    });

    const urlToId = new Map<string, string>();
    filtered.forEach((p) => urlToId.set(p.url, p.id));

    // Arrange nodes in concentric topological orbits
    const width = 800;
    const height = 600;
    const centerX = width / 2;
    const centerY = height / 2;

    const graphNodes: GraphNode[] = filtered.map((p, index) => {
      const dom = p.sourceDomain || (() => {
        try { return new URL(p.url).hostname; } catch { return 'docs'; }
      })();

      const angle = (index / Math.max(filtered.length, 1)) * 2 * Math.PI;
      const ringRadius = 100 + (p.depth * 75) + ((index % 3) * 35);
      const x = centerX + Math.cos(angle) * ringRadius;
      const y = centerY + Math.sin(angle) * ringRadius;
      const radius = Math.min(18, Math.max(9, (p.headings.length || 1) * 1.8 + 7));

      return {
        id: p.id,
        url: p.url,
        title: p.title,
        domain: dom,
        headingsCount: p.headings.length,
        wordCount: p.wordCount,
        depth: p.depth,
        x,
        y,
        vx: 0,
        vy: 0,
        radius,
        color: domainColorMap.get(dom) || '#06b6d4',
        page: p,
      };
    });

    // Detect edges
    const graphEdges: GraphEdge[] = [];
    filtered.forEach((p) => {
      for (const link of p.links) {
        const targetId = urlToId.get(link);
        if (targetId && targetId !== p.id) {
          graphEdges.push({
            sourceId: p.id,
            targetId,
            sourceUrl: p.url,
            targetUrl: link,
          });
        }
      }
    });

    return { nodes: graphNodes, edges: graphEdges };
  }, [pages, domainFilter, searchTerm, domainColorMap]);

  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const connectedEdges = useMemo(() => {
    if (!selectedNodeId) return [];
    return edges.filter(
      (e) => e.sourceId === selectedNodeId || e.targetId === selectedNodeId
    );
  }, [edges, selectedNodeId]);

  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName !== 'circle') {
      setIsDragging(true);
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl h-[88vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-sm shadow-cyan-600/30">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">Documentation Knowledge Graph</h2>
                <span className="px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-800 text-[10px] font-mono text-cyan-300">
                  {nodes.length} nodes • {edges.length} verified links
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Visual relationship explorer mapping real discovered pages and cross-references.
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

        {/* Control Toolbar */}
        <div className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search graph nodes by title or URL..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            {uniqueDomains.length > 1 && (
              <select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 font-mono shrink-0"
              >
                <option value="all">All Domains ({uniqueDomains.length})</option>
                {uniqueDomains.map((dom) => (
                  <option key={dom} value={dom}>
                    {dom}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Canvas Controls */}
          <div className="flex items-center gap-1.5 text-slate-400">
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.2, 2.5))}
              className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200 border border-slate-800 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.2, 0.4))}
              className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200 border border-slate-800 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="p-1.5 rounded hover:bg-slate-800 hover:text-slate-200 border border-slate-800 cursor-pointer"
              title="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono ml-1 text-slate-500">
              {Math.round(zoom * 100)}%
            </span>
          </div>
        </div>

        {/* Main Canvas + Side Inspector */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* SVG Graph View */}
          <div
            className="flex-1 h-full bg-slate-950/90 overflow-hidden cursor-grab active:cursor-grabbing relative"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {nodes.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                No indexed documentation pages available for graph visualization.
              </div>
            ) : (
              <svg
                className="w-full h-full select-none"
                viewBox="0 0 800 600"
              >
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="6"
                    markerHeight="6"
                    refX="14"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 6 3, 0 6" fill="#475569" />
                  </marker>
                </defs>

                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                  {/* Edges */}
                  {edges.map((e, idx) => {
                    const source = nodes.find((n) => n.id === e.sourceId);
                    const target = nodes.find((n) => n.id === e.targetId);
                    if (!source || !target) return null;

                    const isHighlight =
                      selectedNodeId === e.sourceId || selectedNodeId === e.targetId;

                    return (
                      <line
                        key={`edge-${idx}`}
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        stroke={isHighlight ? '#06b6d4' : '#334155'}
                        strokeWidth={isHighlight ? 2 : 1}
                        strokeOpacity={isHighlight ? 0.9 : 0.4}
                        markerEnd="url(#arrowhead)"
                      />
                    );
                  })}

                  {/* Nodes */}
                  {nodes.map((node) => {
                    const isSelected = selectedNodeId === node.id;
                    const isHovered = hoveredNodeId === node.id;

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSelectedNodeId(node.id);
                        }}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        className="cursor-pointer"
                      >
                        {/* Glow halo */}
                        {(isSelected || isHovered) && (
                          <circle
                            r={node.radius + 6}
                            fill={node.color}
                            fillOpacity={0.25}
                            className="animate-pulse"
                          />
                        )}

                        {/* Node circle */}
                        <circle
                          r={node.radius}
                          fill={node.color}
                          stroke="#0f172a"
                          strokeWidth={2}
                          className="transition-transform duration-150 hover:scale-110"
                        />

                        {/* Label */}
                        <text
                          y={node.radius + 12}
                          textAnchor="middle"
                          fill="#94a3b8"
                          fontSize="9"
                          fontFamily="monospace"
                          className="pointer-events-none select-none"
                        >
                          {node.title.length > 20
                            ? `${node.title.slice(0, 18)}...`
                            : node.title}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}

            {/* Quick Legend at bottom-left */}
            <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 backdrop-blur-sm text-[10px] space-y-1.5 shadow-lg">
              <span className="font-semibold text-slate-300 block">Documentation Domains</span>
              <div className="space-y-1">
                {uniqueDomains.map((dom) => (
                  <div key={dom} className="flex items-center gap-1.5 text-slate-400 font-mono">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: domainColorMap.get(dom) || '#06b6d4' }}
                    />
                    <span className="truncate max-w-[140px]">{dom}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Node Inspector Sidebar */}
          <div className="w-80 border-l border-slate-800 bg-slate-900/90 flex flex-col overflow-hidden">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" /> Node Metadata Inspector
              </span>
              {selectedNode && (
                <button
                  onClick={() => setSelectedNodeId(null)}
                  className="text-slate-400 hover:text-slate-200 text-[10px] cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {selectedNode ? (
                <>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-800 text-[9px] font-mono text-cyan-300">
                        {selectedNode.domain}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        Depth: {selectedNode.depth}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-100 text-sm leading-snug">
                      {selectedNode.title}
                    </h3>
                    <a
                      href={selectedNode.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 hover:underline text-[10px] font-mono flex items-center gap-1 break-all"
                    >
                      <span>{selectedNode.url}</span>
                      <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                    </a>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Headings</span>
                      <span className="text-slate-200 font-semibold">{selectedNode.headingsCount}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Word Count</span>
                      <span className="text-slate-200 font-semibold">{selectedNode.wordCount}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Outgoing Links</span>
                      <span className="text-cyan-400 font-semibold">{selectedNode.page.links.length}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Connected Edges</span>
                      <span className="text-emerald-400 font-semibold">{connectedEdges.length}</span>
                    </div>
                  </div>

                  {/* Headings Hierarchy */}
                  {selectedNode.page.headings.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Key Section Headings
                      </span>
                      <div className="max-h-36 overflow-y-auto space-y-1 p-2 rounded bg-slate-950/60 border border-slate-800 font-mono text-[10px] text-slate-300">
                        {selectedNode.page.headings.slice(0, 10).map((h, i) => (
                          <div key={i} className="truncate">
                            <span className="text-cyan-500">{'#'.repeat(h.level)}</span> {h.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-2 space-y-2 border-t border-slate-800">
                    <button
                      onClick={() => {
                        onSelectPage(selectedNode.page);
                        onClose();
                      }}
                      className="w-full py-2 px-3 rounded-md bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect Raw Markdown Preview</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2 py-12">
                  <Network className="w-8 h-8 text-slate-600" />
                  <p>Click any node in the graph to inspect its technical structure, headings, and internal link network.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
