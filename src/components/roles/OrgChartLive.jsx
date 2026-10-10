import { useRef, useState, useMemo, useEffect, useCallback, useId } from 'react';
import {
  ZoomIn, ZoomOut, Maximize, Download, Image, Lock, Unlock,
  Users, FileSpreadsheet, Mail, Phone, Eye, EyeOff, FileSearch, ArrowRightLeft,
} from 'lucide-react';
import { useStore } from '../../store.js';
import { useRolesStore } from '../../roleEngine/store.js';
import { useCatalog, useCatalogMaps } from '../../core/useCatalog.js';
import { downloadPng, downloadSvg, downloadAssignmentsCsv } from '../../roleEngine/exportOrgChart.js';
import { explainVacant } from '../../roleEngine/explain.js';
import { toast } from '../ui/toastStore';
import { confirmDialog } from '../ui/confirmStore';
import Modal from '../Modal';
import MemberExplainModal from './MemberExplainModal';
import {
  buildOrgTree, layoutOrgTree, computeSwapLocks, zoomAt, clampZoom, ORPHAN_POLE_ID,
} from './orgChartLayout.js';
import { countAssignments } from './scenarioStats.js';

// ============================================================
// Couleurs (dérivées du thème du store → réactives)
// ============================================================
const PALETTES = {
  dark: {
    bg: '#0a0a10', grid: 'rgba(255,255,255,0.03)', card: '#14141e', vacantFill: 'rgba(255,255,255,0.02)',
    vacantStroke: 'rgba(255,255,255,0.14)', text: '#f4f4f8', dim: '#9191a2', muted: '#69697a', focus: '#60a5fa',
  },
  light: {
    bg: '#fafafa', grid: 'rgba(0,0,0,0.04)', card: '#ffffff', vacantFill: 'rgba(0,0,0,0.02)',
    vacantStroke: 'rgba(0,0,0,0.16)', text: '#161620', dim: '#64647a', muted: '#9494a2', focus: '#2563eb',
  },
};

const RANK_COLOR = { 1: '#10b981', 2: '#3b82f6', 3: '#f59e0b' };
const rankColor = (rank) => RANK_COLOR[rank] || '#71717a';
const rankEmoji = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank === 'discover' ? '✨' : '⚠️');
const rankText = (rank) => (rank === 1 ? '1er choix' : rank === 2 ? '2e choix' : rank === 3 ? '3e choix' : rank === 'discover' ? 'rôle à découvrir' : 'hors choix');

const DRAG_THRESHOLD = 6;

function truncate(str, max) {
  const s = String(str ?? '');
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

const fullName = (c) => (c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.displayName || 'Candidat' : '');
const safeFileName = (s) => String(s || 'scenario').replace(/[^\p{L}\p{N}_-]+/gu, '_');

// ============================================================
// Nœuds SVG
// ============================================================
function PoleHeader({ node, pal }) {
  return (
    <g>
      <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={10}
        fill={node.color} fillOpacity={0.12} stroke={node.color} strokeOpacity={0.55} strokeWidth={1} />
      <rect x={node.x} y={node.y} width={node.w} height={4} rx={2} fill={node.color} />
      <text x={node.x + node.w / 2} y={node.y + node.h / 2 + 6} textAnchor="middle" fill={pal.text}
        style={{ fontSize: 13, fontWeight: 600 }}>
        {truncate(`${node.emoji ? node.emoji + ' ' : ''}${node.label}`, 26)}
      </text>
    </g>
  );
}

function RoleHeader({ node, pal }) {
  return (
    <g>
      <text x={node.x + 2} y={node.y + node.h / 2 + 4} fill={pal.dim}
        style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>
        {truncate(node.label.toUpperCase(), 26)}
      </text>
      <text x={node.x + node.w - 2} y={node.y + node.h / 2 + 4} textAnchor="end"
        fill={node.filled < node.total ? '#f59e0b' : pal.muted}
        style={{ fontSize: 10, fontFamily: 'monospace' }}>
        {node.filled}/{node.total}
      </text>
    </g>
  );
}

/**
 * Carte d'une place (occupée ou vacante) ou d'un candidat non placé.
 * Focusable au clavier (Entrée/Espace = détail). Le glisser-déposer est géré
 * au niveau du conteneur (Pointer Events) via les attributs data-*.
 */
function CardNode({ node, candidate, roleLabel, pal, isFocused, isDropTarget, isDragSource, onOpen, onFocusNode, onUnlock }) {
  const isUnplaced = node.type === 'unplaced';
  const isVacant = !isUnplaced && !candidate;
  const rank = node.score?.rank;
  const score = node.score?.total;
  const stroke = isUnplaced ? '#f59e0b' : isVacant ? pal.vacantStroke : rankColor(rank);

  const ariaLabel = isUnplaced
    ? `${fullName(candidate)} — non placé — glisse-le sur un poste ou ouvre sa fiche`
    : isVacant
      ? `Poste vacant — ${roleLabel}`
      : `${fullName(candidate)} — ${roleLabel} — score ${Math.round(score ?? 0)}${node.locked ? ' — verrouillé' : ''}`;

  return (
    <g
      data-node-key={node.key}
      data-drop-slot={node.type === 'slot' && node.poleId !== ORPHAN_POLE_ID ? node.key : undefined}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(node); }
      }}
      onFocus={(e) => onFocusNode(node, true, e.currentTarget)}
      onBlur={() => onFocusNode(node, false)}
      style={{ cursor: isVacant ? 'pointer' : 'grab', outline: 'none', opacity: isDragSource ? 0.45 : 1 }}
    >
      <title>{ariaLabel}</title>
      <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={10}
        fill={isVacant ? pal.vacantFill : pal.card}
        stroke={isDropTarget ? pal.focus : stroke}
        strokeWidth={isDropTarget ? 2.5 : isVacant ? 1 : 1.5}
        strokeDasharray={isVacant || isUnplaced ? '4 3' : undefined} />
      {isFocused && (
        <rect data-export-ignore x={node.x - 4} y={node.y - 4} width={node.w + 8} height={node.h + 8} rx={13}
          fill="none" stroke={pal.focus} strokeWidth={2} />
      )}

      {!isVacant && (
        <>
          {!isUnplaced && <rect x={node.x} y={node.y + 8} width={3} height={node.h - 16} fill={node.color} rx={1.5} />}
          <text x={node.x + 12} y={node.y + 22} fill={pal.text} style={{ fontSize: 12, fontWeight: 600, pointerEvents: 'none' }}>
            {truncate(fullName(candidate), node.locked ? 20 : 24)}
          </text>
          <text x={node.x + 12} y={node.y + 40} fill={pal.dim} style={{ fontSize: 10, pointerEvents: 'none' }}>
            {truncate([candidate?.formation, candidate?.year].filter(Boolean).join(' · '), 28)}
          </text>
          {isUnplaced ? (
            <text x={node.x + 12} y={node.y + 57} fill="#f59e0b" style={{ fontSize: 10, fontStyle: 'italic', pointerEvents: 'none' }}>
              Non placé
            </text>
          ) : (
            <>
              <text x={node.x + node.w - 10} y={node.y + 22} textAnchor="end" fill={pal.dim}
                style={{ fontSize: 10, fontFamily: 'monospace', pointerEvents: 'none' }}>
                {Math.round(score ?? 0)}
              </text>
              <text x={node.x + node.w - 10} y={node.y + 44} textAnchor="end" style={{ fontSize: 12, pointerEvents: 'none' }}>
                {rankEmoji(rank)}
              </text>
            </>
          )}
          {node.locked && (
            // Pastille cliquable : retire le verrou SANS ouvrir la fiche
            // (pointerdown stoppé → le conteneur ne démarre aucun geste).
            <g
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onUnlock(node); }}
              style={{ cursor: 'pointer' }}
            >
              <title>Verrouillé — cliquer pour retirer le verrou</title>
              <circle cx={node.x + node.w - 34} cy={node.y + 18} r={9} fill={stroke} />
              <text x={node.x + node.w - 34} y={node.y + 21.5} textAnchor="middle"
                style={{ fontSize: 9, pointerEvents: 'none' }}>
                🔒
              </text>
            </g>
          )}
        </>
      )}

      {isVacant && (
        <text x={node.x + node.w / 2} y={node.y + node.h / 2 + 4} textAnchor="middle" fill={pal.muted}
          style={{ fontSize: 11, fontStyle: 'italic', pointerEvents: 'none' }}>
          Poste vacant
        </text>
      )}
    </g>
  );
}

// ============================================================
// Modale : fiche rapide d'un candidat (coordonnées, verrou, déplacement)
// ============================================================
const maskPhone = (p) => (p ? p.replace(/\d(?=\d{2})/g, '•') : '—');
const maskEmail = (e) => {
  if (!e) return '—';
  const [local, domain] = e.split('@');
  if (!domain) return '•'.repeat(e.length);
  return local.slice(0, 2) + '•'.repeat(Math.max(1, local.length - 2)) + '@' + domain;
};

/**
 * Remontée avec une `key` par candidat : l'état « coordonnées révélées »
 * ne fuit jamais d'un candidat à l'autre.
 */
function CandidateDetailModal({ candidate, assignment, slotOptions, onClose, onToggleLock, onMove, onExplain }) {
  const [revealed, setRevealed] = useState(false);
  const { roleLabel, poleLabel, roles } = useCatalog();
  if (!candidate) return null;

  const placed = !!assignment?.slotId;
  const role = placed ? roles[assignment.roleId] : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={fullName(candidate)}
      description={[candidate.formation, candidate.year].filter(Boolean).join(' · ')}
      maxWidth="max-w-md"
      footer={(
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 btn-secondary text-xs">Fermer</button>
          <button type="button" onClick={onExplain} className="flex-1 btn-primary text-xs">
            <FileSearch size={13} aria-hidden="true" /> Voir la fiche détaillée
          </button>
        </div>
      )}
    >
      <div className="space-y-3">
        <div className="bg-elevated border border-line rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">Affectation</div>
          {placed ? (
            <>
              <div className="text-sm font-semibold text-ink">
                {roleLabel(assignment.roleId)}
                {role && <span className="text-dim font-normal"> · {poleLabel(role.pole)}</span>}
              </div>
              {assignment.score && (
                <div className="text-[11px] text-dim mt-1">
                  Score : <span className="font-mono">{assignment.score.total.toFixed(1)}</span> / 100 · {rankEmoji(assignment.score.rank)} {rankText(assignment.score.rank)}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={`text-[11px] flex items-center gap-1 ${assignment.locked ? 'text-blue-500' : 'text-dim'}`}>
                  {assignment.locked ? <Lock size={11} aria-hidden="true" /> : <Unlock size={11} aria-hidden="true" />}
                  {assignment.locked ? 'Verrouillé sur ce poste' : 'Non verrouillé (le moteur peut le déplacer)'}
                </span>
                <button type="button" onClick={onToggleLock}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-line bg-surface hover:bg-line text-ink flex items-center gap-1 shrink-0">
                  {assignment.locked ? <><Unlock size={11} aria-hidden="true" /> Retirer le verrou</> : <><Lock size={11} aria-hidden="true" /> Verrouiller</>}
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-amber-500 font-medium">Non placé — aucun poste compatible au-dessus du seuil.</div>
          )}
        </div>

        {/* Déplacement accessible au clavier (alternative au glisser-déposer) */}
        <div>
          <label htmlFor="org-move-select" className="text-[11px] text-dim flex items-center gap-1 mb-1">
            <ArrowRightLeft size={11} aria-hidden="true" /> Verrouiller sur un autre poste (échange si occupé)
          </label>
          <select
            id="org-move-select"
            value=""
            onChange={(e) => { if (e.target.value) onMove(e.target.value); }}
            className="w-full bg-elevated border border-line rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-blue-500"
          >
            <option value="">Choisir un poste…</option>
            {slotOptions.map(group => (
              <optgroup key={group.poleId} label={group.label}>
                {group.options.filter(o => o.slotId !== assignment?.slotId).map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setRevealed(r => !r)}
          aria-pressed={revealed}
          className="w-full flex items-center justify-center gap-2 bg-elevated hover:bg-line text-ink text-xs font-medium px-3 py-2 rounded-lg border border-line transition-colors">
          {revealed ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
          {revealed ? 'Masquer les coordonnées' : 'Révéler les coordonnées'}
        </button>

        <div className="space-y-2">
          <div className="flex items-center gap-2.5 bg-elevated border border-line rounded-lg p-2.5">
            <Phone size={14} className="text-dim shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted font-medium">Téléphone</div>
              <div className="text-sm text-ink font-mono mt-0.5">{revealed ? (candidate.phone || '—') : maskPhone(candidate.phone)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 bg-elevated border border-line rounded-lg p-2.5">
            <Mail size={14} className="text-dim shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted font-medium">Email</div>
              <div className="text-sm text-ink font-mono mt-0.5 break-all">{revealed ? (candidate.email || '—') : maskEmail(candidate.email)}</div>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted italic text-center">
          🔒 Données stockées sur cet appareil uniquement — jamais envoyées ni loggées
        </p>
      </div>
    </Modal>
  );
}

function VacantDetailModal({ explanation, onClose }) {
  if (!explanation) return null;
  return (
    <Modal isOpen onClose={onClose} title={explanation.headline} description={explanation.summary} maxWidth="max-w-md">
      <ul className="space-y-1.5">
        {explanation.caveats.map((c) => (
          <li key={c} className="text-xs text-dim flex items-start gap-1.5">
            <span className="text-amber-500 shrink-0" aria-hidden="true">•</span><span>{c}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted mt-3">
        Astuce : glisse un candidat sur ce poste (ou utilise « Verrouiller sur un autre poste » dans sa fiche) pour l'y placer.
      </p>
    </Modal>
  );
}

// ============================================================
// Composant principal
// ============================================================
export default function OrgChartLive() {
  const candidates = useRolesStore(s => s.candidates);
  const scenario = useRolesStore(s => s.scenarios[s.selectedScenarioIndex] || null);
  const stability = useRolesStore(s => s.stability);
  const lockedCount = useRolesStore(s => s.lockedPairs.length);
  const clearLocks = useRolesStore(s => s.clearLocks);
  const theme = useStore(s => s.theme);
  const catalog = useCatalogMaps();
  const { roleLabel } = useCatalog();

  const hasScenario = !!scenario;
  const pal = PALETTES[theme === 'light' ? 'light' : 'dark'];
  const gridId = `org-grid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const gestureRef = useRef({ pointers: new Map(), mode: 'none' });

  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; });

  const [drag, setDrag] = useState(null);        // { key, x, y } (coordonnées monde du fantôme)
  const [dropKey, setDropKey] = useState(null);  // place survolée pendant un glisser
  const [focusedKey, setFocusedKey] = useState(null);
  const [selectedId, setSelectedId] = useState(null);     // candidateId de la fiche rapide
  const [vacantSlotId, setVacantSlotId] = useState(null);
  const [explainId, setExplainId] = useState(null);       // candidateId de la fiche détaillée

  const candidatesById = useMemo(() => new Map(candidates.map(c => [c.id, c])), [candidates]);
  const tree = useMemo(() => buildOrgTree(scenario, catalog), [scenario, catalog]);
  const layout = useMemo(() => layoutOrgTree(tree), [tree]);
  const nodesByKey = useMemo(() => new Map(layout.nodes.map(n => [n.key, n])), [layout]);
  const counts = useMemo(() => countAssignments(scenario), [scenario]);

  // Options du sélecteur « Verrouiller sur un autre poste », groupées par pôle
  const slotOptions = useMemo(() => tree.poles
    .filter(p => p.pole.id !== ORPHAN_POLE_ID)
    .map(p => ({
      poleId: p.pole.id,
      label: `${p.pole.emoji ? p.pole.emoji + ' ' : ''}${p.pole.label}`,
      options: p.roles.flatMap(({ role, slots }) => slots.map(a => {
        const idx = String(a.slotId).split('#')[1];
        const who = a.candidateId ? fullName(candidatesById.get(a.candidateId)) : 'vacant';
        return { key: `slot:${a.slotId}`, slotId: a.slotId, label: `${role.label}${slots.length > 1 ? ` #${idx}` : ''} — ${who}` };
      })),
    })), [tree, candidatesById]);

  // ---------- Zoom molette : écouteur NATIF non passif ----------
  // (le onWheel de React est passif → preventDefault ignoré → la page zoomait)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return; // molette seule = défilement normal de la page
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setView(v => zoomAt(v, e.deltaY > 0 ? 0.9 : 1.1, e.clientX - rect.left, e.clientY - rect.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [hasScenario]);

  const zoomBy = (factor) => {
    const rect = containerRef.current?.getBoundingClientRect();
    setView(v => zoomAt(v, factor, (rect?.width || 0) / 2, (rect?.height || 0) / 2));
  };
  const resetView = () => setView({ zoom: 1, x: 0, y: 0 });
  const fitView = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const zoom = clampZoom(Math.min(rect.width / layout.width, rect.height / layout.height) * 0.95);
    setView({ zoom, x: (rect.width - layout.width * zoom) / 2, y: 0 });
  };

  // ---------- Actions sur les verrous ----------
  /**
   * Échange EXPLICITE (voir computeSwapLocks) : A est verrouillé sur la place
   * cible, B (s'il existe) sur l'ancienne place de A ; les verrous en conflit
   * sont retirés. Mise à jour atomique + UN seul recalcul. Si le moteur ne
   * peut pas honorer le verrou (score sous le seuil, contrainte), on annule
   * pour ne pas laisser A non placé et la place bloquée.
   */
  const performMove = useCallback((fromNode, targetNode) => {
    if (!fromNode?.candidateId || !targetNode || targetNode.type !== 'slot') return;
    if (targetNode.poleId === ORPHAN_POLE_ID || targetNode.slotId === fromNode.slotId) return;
    const st = useRolesStore.getState();
    const previous = st.lockedPairs;
    const { pairs, added, removed } = computeSwapLocks(
      previous,
      { candidateId: fromNode.candidateId, fromSlotId: fromNode.slotId || null },
      { slotId: targetNode.slotId, candidateId: targetNode.candidateId },
    );
    const nameA = fullName(candidatesById.get(fromNode.candidateId));
    const nameB = targetNode.candidateId ? fullName(candidatesById.get(targetNode.candidateId)) : null;
    if (added.length === 0 && removed.length === 0) {
      toast.info('Déjà verrouillé', `${nameA} est déjà verrouillé sur ce poste.`);
      return;
    }
    useRolesStore.setState({ lockedPairs: pairs });
    st.recompute();

    const after = useRolesStore.getState();
    const sc = after.scenarios[after.selectedScenarioIndex];
    const row = sc?.assignments.find(a => a.candidateId === fromNode.candidateId);
    if (row?.slotId !== targetNode.slotId) {
      useRolesStore.setState({ lockedPairs: previous });
      after.recompute();
      toast.warn(
        'Échange impossible',
        `${nameA} n'est pas éligible à « ${roleLabel(targetNode.roleId)} » (score sous le seuil ou contrainte). Aucun verrou n'a été modifié.`,
      );
      return;
    }
    if (nameB && fromNode.slotId) {
      toast.success(`Échange verrouillé : ${nameA} ↔ ${nameB}`, 'Les verrous sont visibles (🔒) et retirables depuis la fiche du candidat.');
    } else if (nameB) {
      toast.success(`Placement verrouillé : ${nameA} → ${roleLabel(targetNode.roleId)}`, `${nameB} libère le poste et sera replacé par le moteur si possible.`);
    } else {
      toast.success(`Placement verrouillé : ${nameA} → ${roleLabel(targetNode.roleId)}`, 'Le verrou est visible (🔒) et retirable depuis la fiche du candidat.');
    }
  }, [candidatesById, roleLabel]);

  const unlockNode = useCallback((node) => {
    const st = useRolesStore.getState();
    if (node?.candidateId && node.slotId && st.isLocked(node.candidateId, node.slotId)) {
      st.toggleLock(node.candidateId, node.slotId);
      toast.info('Verrou retiré', `${fullName(candidatesById.get(node.candidateId))} peut de nouveau être déplacé par le moteur.`);
    }
  }, [candidatesById]);

  const lockNode = useCallback((node) => {
    if (!node?.candidateId || !node.slotId) return;
    const st = useRolesStore.getState();
    if (st.isLocked(node.candidateId, node.slotId)) return;
    // Verrou « sur place » : retire aussi un éventuel autre verrou du candidat / de la place
    const { pairs } = computeSwapLocks(st.lockedPairs, { candidateId: node.candidateId, fromSlotId: node.slotId }, { slotId: node.slotId, candidateId: null });
    useRolesStore.setState({ lockedPairs: pairs });
    st.recompute();
    toast.success('Poste verrouillé', `${fullName(candidatesById.get(node.candidateId))} restera sur « ${roleLabel(node.roleId)} ».`);
  }, [candidatesById, roleLabel]);

  const handleClearLocks = async () => {
    const ok = await confirmDialog({
      title: 'Retirer tous les verrous ?',
      message: `${lockedCount} verrou${lockedCount > 1 ? 's' : ''} seront retirés : le moteur pourra de nouveau déplacer ces candidats.`,
      confirmLabel: 'Retirer les verrous',
      tone: 'warning',
    });
    if (!ok) return;
    clearLocks();
    toast.info('Verrous retirés');
  };

  // ---------- Ouverture des fiches ----------
  const openNode = useCallback((node) => {
    if (!node) return;
    if (node.candidateId) setSelectedId(node.candidateId);
    else if (node.type === 'slot') setVacantSlotId(node.slotId);
  }, []);

  const onFocusNode = useCallback((node, focused, el) => {
    if (!focused) { setFocusedKey(k => (k === node.key ? null : k)); return; }
    // Anneau de focus + recentrage UNIQUEMENT pour le focus clavier
    // (un clic souris ne doit pas faire sauter la vue pendant un glisser).
    let keyboard;
    try { keyboard = !!el?.matches?.(':focus-visible'); } catch { keyboard = true; }
    if (!keyboard) return;
    setFocusedKey(node.key);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setView(v => {
      const sx = node.x * v.zoom + v.x;
      const sy = node.y * v.zoom + v.y;
      const visible = sx >= 0 && sy >= 0 && sx + node.w * v.zoom <= rect.width && sy + node.h * v.zoom <= rect.height;
      if (visible) return v;
      return { ...v, x: rect.width / 2 - (node.x + node.w / 2) * v.zoom, y: rect.height / 2 - (node.y + node.h / 2) * v.zoom };
    });
  }, []);

  // ---------- Gestes : Pointer Events (souris, tactile, stylet) ----------
  const toLocal = (clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const toWorld = (clientX, clientY) => {
    const p = toLocal(clientX, clientY);
    const v = viewRef.current;
    return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom };
  };
  const dropTargetAt = (clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY)?.closest?.('[data-drop-slot]');
    return el ? nodesByKey.get(el.getAttribute('data-drop-slot')) || null : null;
  };
  const endGesture = () => {
    gestureRef.current.mode = 'none';
    gestureRef.current.node = null;
    setDrag(null);
    setDropKey(null);
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const g = gestureRef.current;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* pointeur déjà relâché */ }

    if (g.pointers.size === 2) {
      // Pincer pour zoomer (annule un éventuel glisser en cours)
      const [p1, p2] = [...g.pointers.values()];
      g.mode = 'pinch';
      g.startDist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      g.startCenter = toLocal((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      g.startView = viewRef.current;
      setDrag(null);
      setDropKey(null);
      return;
    }
    if (g.pointers.size > 2) return;

    const key = e.target.closest?.('[data-node-key]')?.getAttribute('data-node-key');
    const node = key ? nodesByKey.get(key) : null;
    g.start = { x: e.clientX, y: e.clientY };
    g.startView = viewRef.current;
    if (node) {
      g.mode = 'press';
      g.node = node;
    } else {
      g.mode = 'pan';
    }
  };

  const onPointerMove = (e) => {
    const g = gestureRef.current;
    if (!g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (g.mode === 'pinch' && g.pointers.size === 2) {
      const [p1, p2] = [...g.pointers.values()];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      const center = toLocal((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      const z = zoomAt(g.startView, dist / g.startDist, g.startCenter.x, g.startCenter.y);
      setView({ zoom: z.zoom, x: z.x + center.x - g.startCenter.x, y: z.y + center.y - g.startCenter.y });
      return;
    }
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (g.mode === 'pan') {
      setView({ ...g.startView, x: g.startView.x + dx, y: g.startView.y + dy });
      return;
    }
    if (g.mode === 'press' && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      g.mode = g.node?.candidateId ? 'drag' : 'pan'; // une place vacante ne se glisse pas : on déplace la vue
    }
    if (g.mode === 'drag') {
      const w = toWorld(e.clientX, e.clientY);
      setDrag({ key: g.node.key, x: w.x, y: w.y });
      const target = dropTargetAt(e.clientX, e.clientY);
      setDropKey(target && target.key !== g.node.key ? target.key : null);
    }
  };

  // Gestionnaire de dépôt UNIQUE (la capture du pointeur garantit qu'il
  // reçoit le relâchement, même hors de la carte).
  const onPointerUp = (e) => {
    const g = gestureRef.current;
    if (!g.pointers.has(e.pointerId)) return;
    g.pointers.delete(e.pointerId);
    if (g.mode === 'pinch') {
      if (g.pointers.size === 0) endGesture();
      else g.mode = 'none'; // un doigt reste posé : on attend qu'il se lève
      return;
    }
    const { mode, node } = g;
    if (mode === 'press') openNode(node);
    else if (mode === 'drag') performMove(node, dropTargetAt(e.clientX, e.clientY));
    endGesture();
  };

  const onPointerCancel = (e) => {
    gestureRef.current.pointers.delete(e.pointerId);
    endGesture();
  };

  // ---------- Exports ----------
  const exportClone = () => {
    const clone = svgRef.current.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', layout.width);
    clone.setAttribute('height', layout.height);
    clone.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    clone.querySelector('g[data-main-group]')?.setAttribute('transform', '');
    clone.querySelectorAll('[data-export-ignore]').forEach(n => n.remove());
    return clone;
  };

  const baseName = safeFileName(scenario?.name);

  const handleDownloadSvg = () => {
    if (!svgRef.current) return;
    downloadSvg(new XMLSerializer().serializeToString(exportClone()), `Organigramme_${baseName}.svg`);
    toast.success('SVG téléchargé');
  };

  const handleDownloadPng = async () => {
    if (!svgRef.current) return;
    const tmp = document.createElement('div');
    tmp.style.cssText = 'position:absolute;left:-99999px;top:0;';
    try {
      const clone = exportClone();
      tmp.appendChild(clone);
      document.body.appendChild(tmp);
      await downloadPng(clone, `Organigramme_${baseName}.png`, pal.bg);
      toast.success('PNG téléchargé');
    } catch (err) {
      toast.error('Export PNG impossible', err.message);
    } finally {
      tmp.remove();
    }
  };

  const handleDownloadCsv = () => {
    downloadAssignmentsCsv(scenario, candidates, `Affectations_${baseName}.csv`, { catalog });
    toast.success('CSV téléchargé');
  };

  if (!scenario) {
    return (
      <div className="text-center py-16 text-dim text-sm">
        Aucun scénario disponible. Importe d'abord un CSV.
      </div>
    );
  }

  // ---------- Données des modales ----------
  const selectedCandidate = selectedId ? candidatesById.get(selectedId) : null;
  const selectedAssignment = selectedId ? scenario.assignments.find(a => a.candidateId === selectedId) || null : null;
  const selectedNode = selectedAssignment
    ? (selectedAssignment.slotId ? nodesByKey.get(`slot:${selectedAssignment.slotId}`) : nodesByKey.get(`unplaced:${selectedId}`))
    : null;

  const vacantExplanation = vacantSlotId
    ? explainVacant(
      String(vacantSlotId).split('#')[0],
      Number(String(vacantSlotId).split('#')[1]) || 1,
      candidates,
      new Set(scenario.assignments.filter(a => a.candidateId && a.slotId).map(a => a.candidateId)),
      { catalog },
    )
    : null;

  const explainCandidate = explainId ? candidatesById.get(explainId) : null;
  const explainAssignmentRow = explainId ? scenario.assignments.find(a => a.candidateId === explainId) : null;

  const dragNode = drag ? nodesByKey.get(drag.key) : null;
  const draggingNow = !!drag;
  const btn = 'p-2 sm:p-1.5 text-dim hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-ink">{scenario.name}</h3>
          <span className="text-[10px] bg-elevated border border-line rounded px-1.5 py-0.5 text-dim font-mono">{counts.placed} placés</span>
          {counts.unplaced > 0 && (
            <span className="text-[10px] bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 text-amber-500 font-mono">{counts.unplaced} non placés</span>
          )}
          <span className="text-[10px] bg-elevated border border-line rounded px-1.5 py-0.5 text-dim font-mono">{counts.vacant} vacants</span>
          {lockedCount > 0 && (
            <button type="button" onClick={handleClearLocks}
              className="text-[10px] bg-blue-500/10 border border-blue-500/30 rounded px-1.5 py-0.5 text-blue-500 font-mono flex items-center gap-1 hover:bg-blue-500/20"
              title="Retirer tous les verrous">
              <Lock size={10} aria-hidden="true" /> {lockedCount} verrou{lockedCount > 1 ? 's' : ''} · retirer
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center bg-elevated p-0.5 rounded-lg border border-line" role="group" aria-label="Zoom de l'organigramme">
            <button type="button" onClick={() => zoomBy(1 / 1.2)} className={btn} aria-label="Dézoomer" title="Dézoomer">
              <ZoomOut size={14} aria-hidden="true" />
            </button>
            <span className="px-2 py-1 text-[10px] font-mono text-dim w-12 text-center" aria-live="polite">
              {Math.round(view.zoom * 100)}%
            </span>
            <button type="button" onClick={() => zoomBy(1.2)} className={btn} aria-label="Zoomer" title="Zoomer">
              <ZoomIn size={14} aria-hidden="true" />
            </button>
            <button type="button" onClick={resetView} className={`${btn} border-l border-line`} aria-label="Réinitialiser la vue (100 %)" title="Réinitialiser la vue">
              <Maximize size={13} aria-hidden="true" />
            </button>
            <button type="button" onClick={fitView} className="px-2 py-1 text-[10px] text-dim hover:text-ink transition-colors border-l border-line" aria-label="Ajuster l'organigramme à la fenêtre">
              Ajuster
            </button>
          </div>

          <button type="button" onClick={handleDownloadSvg} className="text-xs bg-elevated hover:bg-line border border-line text-ink px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5" aria-label="Télécharger l'organigramme en SVG">
            <Download size={11} aria-hidden="true" /> SVG
          </button>
          <button type="button" onClick={handleDownloadPng} className="text-xs bg-elevated hover:bg-line border border-line text-ink px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5" aria-label="Télécharger l'organigramme en PNG">
            <Image size={11} aria-hidden="true" /> PNG
          </button>
          <button type="button" onClick={handleDownloadCsv} className="text-xs bg-elevated hover:bg-line border border-line text-ink px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5" aria-label="Télécharger les affectations en CSV">
            <FileSpreadsheet size={11} aria-hidden="true" /> CSV
          </button>
        </div>
      </div>

      <div className="text-[11px] text-dim bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-2 flex items-start gap-2">
        <Users size={11} className="text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          <strong className="text-ink">Clic / Entrée</strong> sur une carte = fiche ·{' '}
          <strong className="text-ink">Glisser</strong> un candidat sur un poste = échange <strong className="text-ink">verrouillé</strong> (🔒, retirable) ·{' '}
          <strong className="text-ink">Ctrl + molette</strong> ou pincer = zoom · glisser le fond = déplacer la vue.
          Les verrous s'appliquent à tous les scénarios.
        </span>
      </div>

      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="relative bg-base border border-line rounded-2xl overflow-hidden select-none"
        style={{ height: '68vh', touchAction: 'none', cursor: draggingNow ? 'grabbing' : 'default' }}
      >
        <svg ref={svgRef} width="100%" height="100%" role="group"
          aria-label={`Organigramme du scénario ${scenario.name} : ${counts.placed} placés, ${counts.unplaced} non placés, ${counts.vacant} postes vacants`}>
          <defs>
            <pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke={pal.grid} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={pal.bg} />
          <rect width="100%" height="100%" fill={`url(#${gridId})`} />
          <g data-main-group transform={`translate(${view.x}, ${view.y}) scale(${view.zoom})`}>
            {layout.nodes.map(node => {
              if (node.type === 'pole') return <PoleHeader key={node.key} node={node} pal={pal} />;
              if (node.type === 'unplacedHeader') {
                return <PoleHeader key={node.key} node={{ ...node, color: '#f59e0b', emoji: '⏳' }} pal={pal} />;
              }
              if (node.type === 'role') return <RoleHeader key={node.key} node={node} pal={pal} />;
              return (
                <CardNode
                  key={node.key}
                  node={node}
                  candidate={node.candidateId ? candidatesById.get(node.candidateId) : null}
                  roleLabel={node.roleId ? roleLabel(node.roleId) : ''}
                  pal={pal}
                  isFocused={focusedKey === node.key}
                  isDropTarget={dropKey === node.key}
                  isDragSource={drag?.key === node.key}
                  onOpen={openNode}
                  onFocusNode={onFocusNode}
                  onUnlock={unlockNode}
                />
              );
            })}

            {/* Fantôme du glisser (ignoré par elementFromPoint et par les exports) */}
            {dragNode && (
              <g data-export-ignore style={{ pointerEvents: 'none' }} opacity={0.85}>
                <rect x={drag.x - dragNode.w / 2} y={drag.y - dragNode.h / 2} width={dragNode.w} height={dragNode.h} rx={10}
                  fill={pal.card} stroke={pal.focus} strokeWidth={2} />
                <text x={drag.x - dragNode.w / 2 + 12} y={drag.y + 4} fill={pal.text} style={{ fontSize: 12, fontWeight: 600 }}>
                  {truncate(fullName(candidatesById.get(dragNode.candidateId)), 24)}
                </text>
              </g>
            )}
          </g>
        </svg>

        <div className="absolute top-3 left-3 bg-surface/90 backdrop-blur border border-line rounded-lg px-3 py-2 flex items-center gap-3 text-[10px] pointer-events-none" aria-hidden="true">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-dim">🥇 {counts.rank1}</span></span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-dim">🥈 {counts.rank2}</span></span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-dim">🥉 {counts.rank3}</span></span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-500" /><span className="text-dim">⚠️ {counts.out + counts.discover}</span></span>
        </div>
      </div>

      {selectedCandidate && (
        <CandidateDetailModal
          key={selectedId}
          candidate={selectedCandidate}
          assignment={selectedAssignment}
          slotOptions={slotOptions}
          onClose={() => setSelectedId(null)}
          onToggleLock={() => (selectedAssignment?.locked ? unlockNode(selectedNode) : lockNode(selectedNode))}
          onMove={(targetKey) => {
            performMove(selectedNode, nodesByKey.get(targetKey));
            setSelectedId(null);
          }}
          onExplain={() => { setExplainId(selectedId); setSelectedId(null); }}
        />
      )}

      <VacantDetailModal explanation={vacantExplanation} onClose={() => setVacantSlotId(null)} />

      <MemberExplainModal
        isOpen={!!explainCandidate && !!explainAssignmentRow}
        onClose={() => setExplainId(null)}
        candidate={explainCandidate}
        assignment={explainAssignmentRow}
        stability={stability}
        weights={scenario.weights}
      />
    </div>
  );
}
