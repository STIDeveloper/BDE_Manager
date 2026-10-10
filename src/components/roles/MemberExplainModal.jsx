import { Quote, AlertTriangle, TrendingUp, Download, ChevronRight } from 'lucide-react';
import Modal from '../Modal';
import { explainAssignment, generateMemberCard } from '../../roleEngine/explain.js';
import { downloadMemberCard } from '../../roleEngine/exportOrgChart.js';
import { useRolesStore } from '../../roleEngine/store.js';
import { useCatalogMaps } from '../../core/useCatalog.js';
import { poleLabelIn } from '../../core/catalog.js';
import { toast } from '../ui/toastStore';

const CRITERIA_LABEL = {
  P: 'Préférence', D: 'Disponibilité', E: 'Expérience',
  A: 'Ambition', M: 'Motivation', F: 'Formation',
};

/**
 * Fiche détaillée (explication du score) d'un candidat placé ou non placé.
 * @param {object} props
 * @param {object} [props.weights]  Poids du scénario affiché (défaut : poids courants)
 */
export default function MemberExplainModal({ isOpen, onClose, candidate, assignment, stability, weights }) {
  // Hooks AVANT tout retour anticipé (règles des hooks)
  const catalog = useCatalogMaps();
  const currentWeights = useRolesStore(s => s.weights);

  if (!isOpen || !candidate || !assignment) return null;

  const role = assignment.roleId ? catalog.roles[assignment.roleId] : null;

  // Garde sur stability.stability avant .get()
  let stabScore = null;
  if (assignment.roleId && stability?.stability && typeof stability.stability.get === 'function') {
    stabScore = stability.stability.get(`${candidate.id}:${assignment.roleId}`) ?? null;
  }

  const stabState = stabScore == null
    ? null
    : stabScore >= 0.75 ? 'stable' : stabScore >= 0.5 ? 'unstable' : 'critical';

  const opts = {
    weights: weights || currentWeights,
    stability: stabState,
    stabilityScore: stabScore,
    catalog,
  };
  const explanation = explainAssignment(assignment, candidate, opts);

  const handleExport = () => {
    try {
      const text = generateMemberCard(assignment, candidate, opts);
      downloadMemberCard(text, candidate);
      toast.success('Fiche téléchargée');
    } catch (err) {
      toast.error('Export impossible', err.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Fiche candidat">
      <div className="space-y-4">
        {/* En-tête */}
        <div>
          <h3 className="text-base font-semibold text-ink">
            {candidate.firstName} {candidate.lastName}
          </h3>
          <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px]">
            <span className="badge badge-neutral">{candidate.formation}</span>
            <span className="badge badge-neutral">{candidate.year}</span>
            {candidate.alternance && <span className="badge badge-amber">Alternance</span>}
          </div>
        </div>

        {/* Affectation */}
        <div className="bg-elevated border border-line rounded-lg p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted font-medium">
                Affectation proposée
              </div>
              <div className="text-sm font-semibold text-ink mt-1">
                {explanation.headline}
              </div>
              {role && (
                <div className="text-[11px] text-dim mt-0.5">
                  {poleLabelIn(catalog, role.pole)} · {catalog.levels[role.level]?.label || role.level}
                </div>
              )}
            </div>
            {assignment.score && (
              <div className="text-right shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-muted font-medium">Score</div>
                <div className="text-lg font-bold text-ink tabular-nums">
                  {assignment.score.total.toFixed(1)}
                </div>
              </div>
            )}
          </div>
          <div className="mt-2 text-xs text-dim">{explanation.summary}</div>
          {stabScore != null && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px]">
              <span className="text-muted">Stabilité :</span>
              <span className={
                stabState === 'stable' ? 'text-emerald-500'
                : stabState === 'unstable' ? 'text-amber-500'
                : 'text-red-500'
              }>
                {Math.round(stabScore * 100)}%
              </span>
            </div>
          )}
        </div>

        {/* Critères */}
        {explanation.criteria.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-ink mb-2 flex items-center gap-1.5">
              <TrendingUp size={12} className="text-blue-500" />
              Décomposition du score
            </h4>
            <div className="space-y-1.5">
              {explanation.criteria.map(c => (
                <div key={c.key} className="flex items-center gap-2 text-xs">
                  <span className="text-dim w-24 shrink-0">{CRITERIA_LABEL[c.key]}</span>
                  <div className="flex-1 h-1.5 bg-elevated rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, c.contribution * 4)}%` }} />
                  </div>
                  <span className="text-dim font-mono tabular-nums w-10 text-right">
                    {c.contribution.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signaux */}
        {explanation.signals.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-ink mb-2 flex items-center gap-1.5">
              <Quote size={12} className="text-purple-500" />
              Citations détectées ({explanation.signals.length})
            </h4>
            <div className="space-y-1.5">
              {explanation.signals.map((s, i) => (
                <div key={`${s.type}-${i}`} className="bg-elevated border border-line rounded-lg p-2.5 text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-muted font-medium mb-1">
                    {s.type}
                  </div>
                  <div className="text-dim italic">"{s.quote}"</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pénalités */}
        {explanation.penalties.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-ink mb-2 flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-amber-500" />
              Pénalités appliquées
            </h4>
            <ul className="space-y-1">
              {explanation.penalties.map((p, i) => (
                <li key={i} className="text-xs text-dim flex items-start gap-1.5">
                  <ChevronRight size={11} className="shrink-0 mt-0.5 text-amber-500" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Points d'attention */}
        {explanation.caveats.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-amber-500 mb-2 flex items-center gap-1.5">
              <AlertTriangle size={12} />
              Points d'attention
            </h4>
            <ul className="space-y-1">
              {explanation.caveats.map((c, i) => (
                <li key={i} className="text-xs text-dim flex items-start gap-1.5">
                  <span className="text-amber-500 shrink-0">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 pt-3 border-t border-line">
          <button onClick={onClose}
            className="flex-1 btn-secondary text-xs">
            Fermer
          </button>
          <button onClick={handleExport}
            className="flex-1 btn-primary text-xs">
            <Download size={12} /> Télécharger la fiche
          </button>
        </div>
      </div>
    </Modal>
  );
}
