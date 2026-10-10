import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import {
  ZoomIn, ZoomOut, Maximize, Download, Image, Lock, Unlock,
  Users, FileSpreadsheet, Mail, Phone, Eye, EyeOff, X,
} from 'lucide-react';
import { useRolesStore } from '../../roleEngine/store.js';
import { ROLE_CATALOG } from '../../roleEngine/config.js';
import { downloadPng, downloadSvg, downloadAssignmentsCsv } from '../../roleEngine/exportOrgChart.js';
import { toast } from '../ui/toastStore';
import { explainAssignment } from '../../roleEngine/explain.js';

// ============================================================
// Layout
// ============================================================
const NODE_W = 200;
const NODE_H = 68;
const H_GAP = 28;
const V_GAP = 60;
const PADDING = 40;

// ============================================================
// Helpers
// ============================================================
function truncate(str, max) {
  const s = String(str ?? '');
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function buildTree(scenario) {
  const byPole = {};
  scenario.assignments.forEach(a => {
    if (!a.slotId) return;
    const role = ROLE_CATALOG.find(r => r.id === a.roleId);
    if (!role) return;
    if (!byPole[role.pole]) byPole[role.pole] = { pole: role.pole, roles: {} };
    if (!byPole[role.pole].roles[role.id]) {
      byPole[role.pole].roles[role.id] = { role, slots: [] };
    }
    byPole[role.pole].roles[role.id].slots.push(a);
  });
  return Object.values(byPole);
}

function layoutTree(tree) {
  const nodes = [];
  let x = PADDING;
  const slotStep = NODE_H + 12;

  tree.forEach(branch => {
    const rolesArr = Object.values(branch.roles);
    const y0 = PADDING + 46 + V_GAP / 2;

    nodes.push({
      type: 'pole',
      label: branch.pole,
      x, y: PADDING,
      w: NODE_W,
      h: 36,
      pole: branch.pole,
    });

    let y = y0;
    rolesArr.forEach(r => {
      nodes.push({
        type: 'role',
        roleId: r.role.id,
        label: r.role.label,
        level: r.role.level,
        x, y,
        w: NODE_W,
        h: 26,
        pole: branch.pole,
      });
      y += 32;

      r.slots.forEach(slot => {
        nodes.push({
          type: 'slot',
          slotId: slot.slotId,
          roleId: slot.roleId,
          candidateId: slot.candidateId,
          score: slot.score,
          locked: slot.locked,
          vacant: slot.vacant,
          x, y,
          w: NODE_W,
          h: NODE_H,
        });
        y += slotStep;
      });
      y += V_GAP / 2;
    });

    x += NODE_W + H_GAP * 2;
  });

  return nodes;
}

// ============================================================
// SVG Node
// ============================================================
function NodeBox({ node, candidates, onDragStart, onDragOver, onDrop, onToggleLock, onSelect, theme }) {
  const isDark = theme === 'dark';
  const cx = node.x + node.w / 2;

  if (node.type === 'pole') {
    return (
      <g>
        <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={10}
          fill={isDark ? 'rgba(79,129,245,0.08)' : 'rgba(79,129,245,0.06)'}
          stroke={isDark ? 'rgba(79,129,245,0.3)' : 'rgba(79,129,245,0.25)'}
          strokeWidth={1} />
        <text x={cx} y={node.y + node.h / 2 + 5} textAnchor="middle"
          fill={isDark ? '#e4e4ec' : '#161620'}
          style={{ fontSize: 13, fontWeight: 600 }}>
          {node.label}
        </text>
      </g>
    );
  }

  if (node.type === 'role') {
    return (
      <g>
        <text x={cx} y={node.y + node.h / 2 + 4} textAnchor="middle"
          fill={isDark ? '#9191a2' : '#64647a'}
          style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>
          {truncate(node.label.toUpperCase(), 32)}
        </text>
      </g>
    );
  }

  // SLOT
  const candidate = node.candidateId ? candidates.find(c => c.id === node.candidateId) : null;
  const isVacant = node.vacant || !candidate;
  const rank = node.score?.rank;
  const score = node.score?.total ?? 0;

  const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : isVacant ? '' : '⚠️';
  const rankColor = rank === 1 ? '#10b981' : rank === 2 ? '#3b82f6' : rank === 3 ? '#f59e0b' : '#71717a';

  return (
    <g
      onMouseDown={(e) => !isVacant && onDragStart(e, node)}
      onMouseUp={(e) => onDrop(e, node)}
      onMouseEnter={(e) => onDragOver(e, node)}
      onClick={(e) => !isVacant && onSelect(e, node)}
      style={{ cursor: isVacant ? 'default' : 'pointer' }}
    >
      <title>
        {candidate
          ? `${candidate.firstName} ${candidate.lastName}\n${candidate.formation} · ${candidate.year}\nRôle : ${ROLE_CATALOG.find(r => r.id === node.roleId)?.label}\nScore : ${score.toFixed(1)}\nCliquer pour plus d'infos`
          : 'Poste vacant'}
      </title>

      <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={10}
        fill={
          isVacant
            ? (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')
            : (isDark ? 'rgba(20,20,30,1)' : 'white')
        }
        stroke={isVacant ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)') : rankColor}
        strokeWidth={isVacant ? 1 : 1.5}
        strokeDasharray={isVacant ? '3 3' : '0'} />

      {!isVacant && (
        <>
          <rect x={node.x} y={node.y} width={3} height={node.h} fill={rankColor} rx={10} />

          {/* Nom */}
          <text x={node.x + 12} y={node.y + 22}
            fill={isDark ? '#f4f4f8' : '#161620'}
            style={{ fontSize: 12, fontWeight: 600, pointerEvents: 'none' }}>
            {truncate(`${candidate.firstName} ${candidate.lastName || ''}`.trim(), 24)}
          </text>

          {/* Formation · Année */}
          <text x={node.x + 12} y={node.y + 40}
            fill={isDark ? '#9191a2' : '#64647a'}
            style={{ fontSize: 10, pointerEvents: 'none' }}>
            {truncate(`${candidate.formation} · ${candidate.year}`, 28)}
          </text>

          {/* Score */}
          <text x={node.x + node.w - 10} y={node.y + 22} textAnchor="end"
            fill={isDark ? '#9191a2' : '#64647a'}
            style={{ fontSize: 10, fontFamily: 'monospace', pointerEvents: 'none' }}>
            {score.toFixed(0)}
          </text>

          {/* Rang */}
          <text x={node.x + node.w - 10} y={node.y + 42} textAnchor="end"
            style={{ fontSize: 12, pointerEvents: 'none' }}>
            {rankEmoji}
          </text>

          {/* Verrou */}
          {node.locked && (
            <g onClick={(e) => { e.stopPropagation(); onToggleLock(node); }} style={{ cursor: 'pointer' }}>
              <circle cx={node.x + 8} cy={node.y + 8} r={8} fill={rankColor} opacity={0.9} />
              <text x={node.x + 8} y={node.y + 11} textAnchor="middle"
                style={{ fontSize: 8, fill: 'white', fontWeight: 'bold', pointerEvents: 'none' }}>
                🔒
              </text>
            </g>
          )}
        </>
      )}

      {isVacant && (
        <text x={cx} y={node.y + node.h / 2 + 4} textAnchor="middle"
          fill={isDark ? '#69697a' : '#9494a2'}
          style={{ fontSize: 11, fontStyle: 'italic' }}>
          Poste vacant
        </text>
      )}
    </g>
  );
}

// ============================================================
// Modale contact (compacte)
// ============================================================
function ContactModal({ isOpen, onClose, candidate, assignment }) {
  const [revealed, setRevealed] = useState(false);
  if (!isOpen || !candidate) return null;

  const role = assignment?.roleId ? ROLE_CATALOG.find(r => r.id === assignment.roleId) : null;

  const maskPhone = (p) => p ? p.replace(/\d(?=\d{2})/g, '•') : '—';
  const maskEmail = (e) => {
    if (!e) return '—';
    const [local, domain] = e.split('@');
    if (!domain) return '•'.repeat(e.length);
    return local.slice(0, 2) + '•'.repeat(Math.max(1, local.length - 2)) + '@' + domain;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-line rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-line">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink truncate">
              {candidate.firstName} {candidate.lastName}
            </h3>
            <p className="text-xs text-dim truncate">{candidate.formation} · {candidate.year}</p>
          </div>
          <button onClick={onClose} className="text-dim hover:text-ink p-1 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {role && (
            <div className="bg-elevated border border-line rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">
                Affectation
              </div>
              <div className="text-sm font-semibold text-ink">{role.label}</div>
              {assignment?.score && (
                <div className="text-[11px] text-dim mt-1">
                  Score : <span className="font-mono">{assignment.score.total.toFixed(1)}</span> / 100
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setRevealed(!revealed)}
            className="w-full flex items-center justify-center gap-2 bg-elevated hover:bg-line text-ink text-xs font-medium px-3 py-2 rounded-lg border border-line transition-colors">
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
            {revealed ? 'Masquer les coordonnées' : 'Révéler les coordonnées'}
          </button>

          <div className="space-y-2">
            <div className="flex items-center gap-2.5 bg-elevated border border-line rounded-lg p-2.5">
              <Phone size={14} className="text-dim shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-muted font-medium">Téléphone</div>
                <div className="text-sm text-ink font-mono mt-0.5">
                  {revealed ? (candidate.phone || '—') : maskPhone(candidate.phone)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-elevated border border-line rounded-lg p-2.5">
              <Mail size={14} className="text-dim shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-muted font-medium">Email</div>
                <div className="text-sm text-ink font-mono mt-0.5 break-all">
                  {revealed ? (candidate.email || '—') : maskEmail(candidate.email)}
                </div>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-muted italic text-center">
            🔒 Données locales uniquement — jamais envoyées ni loggées
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Composant principal
// ============================================================
export default function OrgChartLive() {
  const {
    candidates, scenarios, selectedScenarioIndex, getSelectedScenario, toggleLock,
  } = useRolesStore();

  const scenario = getSelectedScenario();
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(null);
  const [hoverNode, setHoverNode] = useState(null);
  const [selected, setSelected] = useState(null); // { candidate, assignment }

  const layout = useMemo(() => {
    if (!scenario) return { nodes: [], width: 800, height: 600 };
    const tree = buildTree(scenario);
    const nodes = layoutTree(tree);
    const maxX = Math.max(...nodes.map(n => n.x + n.w), 0) + PADDING;
    const maxY = Math.max(...nodes.map(n => n.y + n.h), 0) + PADDING;
    return { nodes, width: Math.max(maxX, 900), height: Math.max(maxY, 600) };
  }, [scenario]);

  const handleWheel = useCallback((e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.3, Math.min(2.5, z * delta)));
  }, []);

  const handleMouseDown = (e) => {
    if (e.target.closest('[data-slot]')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPan = { ...pan };
    const onMove = (ev) => {
      setPan({ x: startPan.x + (ev.clientX - startX), y: startPan.y + (ev.clientY - startY) });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const centerView = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = rect.width / layout.width;
    const scaleY = rect.height / layout.height;
    setZoom(Math.max(0.3, Math.min(2, Math.min(scaleX, scaleY) * 0.95)));
    setPan({ x: 0, y: 0 });
  };

  const onDragStart = (e, node) => {
    if (!node.candidateId) return;
    setDragging({ fromNode: node, startX: e.clientX, startY: e.clientY, moved: false });
  };

  const onDragOver = (e, node) => {
    if (!dragging) return;
    setHoverNode(node);
  };

  const onDrop = (e, targetNode) => {
    if (!dragging) return;

    // Distance parcourue : distingue clic vs drag
    const dist = Math.sqrt(
      Math.pow(e.clientX - dragging.startX, 2) + Math.pow(e.clientY - dragging.startY, 2)
    );

    // Clic court → ouvrir la modale
    if (dist < 5) {
      if (dragging.fromNode.candidateId) {
        const assignment = scenario.assignments.find(a => a.slotId === dragging.fromNode.slotId);
        const candidate = candidates.find(c => c.id === dragging.fromNode.candidateId);
        if (assignment && candidate) setSelected({ candidate, assignment });
      }
      setDragging(null);
      setHoverNode(null);
      return;
    }

    // Drag → échange
    if (!targetNode || targetNode.type !== 'slot') {
      setDragging(null);
      setHoverNode(null);
      return;
    }

    const from = dragging.fromNode;
    const to = targetNode;

    if (from.candidateId && to.slotId && from.slotId !== to.slotId) {
      toggleLock(from.candidateId, to.slotId);
      if (to.candidateId) toggleLock(to.candidateId, from.slotId);
      const c = candidates.find(x => x.id === from.candidateId);
      const r = ROLE_CATALOG.find(r => r.id === to.roleId);
      toast.success('Échange enregistré', `${c?.firstName || ''} → ${r?.label || ''}`);
    }

    setDragging(null);
    setHoverNode(null);
  };

  const onToggleLock = (node) => {
    if (!node.candidateId || !node.slotId) return;
    toggleLock(node.candidateId, node.slotId);
  };

  const onSelect = (e, node) => {
    // Handled in onDrop (clic court) — évite le double trigger
  };

  const handleDownloadSvg = () => {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.querySelector('g[data-main-group]')?.setAttribute('transform', '');
    downloadSvg(new XMLSerializer().serializeToString(clone), `Organigramme_${scenario.name.replace(/\s+/g, '_')}.svg`);
    toast.success('SVG téléchargé');
  };

  const handleDownloadPng = async () => {
    if (!svgRef.current) return;
    try {
      const clone = svgRef.current.cloneNode(true);
      clone.querySelector('g[data-main-group]')?.setAttribute('transform', '');
      const tmp = document.createElement('div');
      tmp.style.position = 'absolute';
      tmp.style.left = '-9999px';
      tmp.appendChild(clone);
      document.body.appendChild(tmp);
      await downloadPng(clone, `Organigramme_${scenario.name.replace(/\s+/g, '_')}.png`,
        document.documentElement.classList.contains('light') ? '#fafafa' : '#0a0a10');
      document.body.removeChild(tmp);
      toast.success('PNG téléchargé');
    } catch (err) {
      toast.error('Export PNG impossible', err.message);
    }
  };

  const handleDownloadCsv = () => {
    downloadAssignmentsCsv(scenario, candidates, `Affectations_${scenario.name.replace(/\s+/g, '_')}.csv`);
    toast.success('CSV téléchargé');
  };

  if (!scenario) {
    return (
      <div className="text-center py-16 text-dim text-sm">
        Aucun scénario disponible. Importe d'abord un CSV.
      </div>
    );
  }

  const isDark = document.documentElement.classList.contains('dark');
  const bgColor = isDark ? '#0a0a10' : '#fafafa';
  const gridColor = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">{scenario.name}</h3>
          <span className="text-[10px] bg-elevated border border-line rounded px-1.5 py-0.5 text-dim font-mono">
            {scenario.assignments.filter(a => a.candidateId).length} placés
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex bg-elevated p-0.5 rounded-lg border border-line">
            <button onClick={() => setZoom(z => Math.max(0.3, z - 0.15))} className="p-1.5 text-dim hover:text-ink transition-colors" title="Zoom -">
              <ZoomOut size={13} />
            </button>
            <span className="px-2 py-1 text-[10px] font-mono text-dim w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => setZoom(z => Math.min(2.5, z + 0.15))} className="p-1.5 text-dim hover:text-ink transition-colors" title="Zoom +">
              <ZoomIn size={13} />
            </button>
            <button onClick={resetView} className="p-1.5 text-dim hover:text-ink transition-colors border-l border-line" title="Reset">
              <Maximize size={12} />
            </button>
            <button onClick={centerView} className="px-2 py-1 text-[10px] text-dim hover:text-ink transition-colors border-l border-line">
              Ajuster
            </button>
          </div>

          <button onClick={handleDownloadSvg} className="text-xs bg-elevated hover:bg-line border border-line text-ink px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
            <Download size={11} /> SVG
          </button>
          <button onClick={handleDownloadPng} className="text-xs bg-elevated hover:bg-line border border-line text-ink px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
            <Image size={11} /> PNG
          </button>
          <button onClick={handleDownloadCsv} className="text-xs bg-elevated hover:bg-line border border-line text-ink px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
            <FileSpreadsheet size={11} /> CSV
          </button>
        </div>
      </div>

      <div className="text-[11px] text-dim bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
        <Users size={11} className="text-blue-500 shrink-0" />
        <span>
          <strong className="text-ink">Clic</strong> sur une carte = coordonnées · <strong className="text-ink">Glisser</strong> d'un poste à l'autre = échange
        </span>
      </div>

      <div ref={containerRef} onWheel={handleWheel} onMouseDown={handleMouseDown}
        onMouseUp={(e) => onDrop(e, hoverNode)}
        className="relative bg-base border border-line rounded-2xl overflow-hidden select-none"
        style={{ height: '68vh', cursor: dragging ? 'grabbing' : 'default' }}>
        <svg ref={svgRef} width="100%" height="100%" style={{ background: bgColor }}>
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke={gridColor} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          <g data-main-group transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {layout.nodes.map((node, i) => (
              <g key={i} data-slot={node.type === 'slot' ? node.slotId : undefined}>
                <NodeBox
                  node={node}
                  candidates={candidates}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  onToggleLock={onToggleLock}
                  onSelect={onSelect}
                  theme={isDark ? 'dark' : 'light'}
                />
              </g>
            ))}
          </g>
        </svg>

        <div className="absolute top-3 left-3 bg-surface/90 backdrop-blur border border-line rounded-lg px-3 py-2 flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-dim">🥇 {scenario.assignments.filter(a => a.score?.rank === 1).length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-dim">🥈 {scenario.assignments.filter(a => a.score?.rank === 2).length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-dim">🥉 {scenario.assignments.filter(a => a.score?.rank === 3).length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-zinc-500" />
            <span className="text-dim">⚠️ {scenario.assignments.filter(a => a.candidateId && ![1, 2, 3].includes(a.score?.rank)).length}</span>
          </div>
        </div>
      </div>

      <ContactModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        candidate={selected?.candidate}
        assignment={selected?.assignment}
      />
    </div>
  );
}
