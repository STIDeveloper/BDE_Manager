// ============================================================
// ÉLECTIONS — page publique de vérification d'un reçu (#/bulletin/<formId>)
// ============================================================
// Le votant saisit le code de reçu obtenu après son vote : le serveur
// répond seulement « ce bulletin est dans l'urne » ou non (RPC
// verify_ballot, accessible sans compte). Rien n'est révélé sur le choix
// exprimé ni sur l'identité du votant. Page légère, hors coque de l'app.

import { useMemo, useState } from 'react';
import { CheckCircle2, FileSearch, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { useRoute } from '../../core/router.js';
import Shell, { StateCard } from '../runtime/Shell.jsx';
import { verifyBallot, voteErrorMessage } from './api.js';
import { isFormUuid, isReceiptCode, listReceipts, normalizeReceipt, useReceipts } from './receipts.js';
import AnonymityNotice from './AnonymityNotice.jsx';


export function ReceiptChecker({ formId, autoFocus = false }) {
  const [code, setCode] = useState('');
  const [state, setState] = useState({ status: 'idle' });
  const receipts = useReceipts();
  const saved = useMemo(() => receipts.filter(r => r.formId === formId), [receipts, formId]);

  const check = async (value) => {
    const c = normalizeReceipt(value);
    if (!isReceiptCode(c)) { setState({ status: 'invalid' }); return; }
    setState({ status: 'busy' });
    try {
      const counted = await verifyBallot(formId, c);
      setState({ status: counted ? 'counted' : 'missing', code: c });
    } catch (err) {
      setState({ status: 'error', error: voteErrorMessage(err) });
    }
  };

  return (
    <div className="fr-stack-sm" style={{ textAlign: 'left' }}>
      <form onSubmit={(e) => { e.preventDefault(); check(code); }} className="fr-stack-sm" noValidate>
        <label htmlFor="ballot-code" className="fr-label">Code de reçu</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input id="ballot-code" className="fr-input" style={{ flex: '1 1 240px', fontFamily: 'ui-monospace, monospace' }}
            value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} autoComplete="off" autoCapitalize="off"
            placeholder="32 caractères (0-9, a-f)" autoFocus={autoFocus}
            aria-invalid={state.status === 'invalid' || undefined} aria-describedby="ballot-result" />
          <button type="submit" className="fr-btn fr-btn-primary" disabled={!code.trim() || state.status === 'busy'}>
            {state.status === 'busy' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileSearch size={16} aria-hidden="true" />} Vérifier
          </button>
        </div>
      </form>
      <div id="ballot-result" role="status" aria-live="polite">
        {state.status === 'invalid' && <p className="fr-alert fr-alert-warn">Ce code n’a pas le bon format : 32 caractères, chiffres et lettres de a à f.</p>}
        {state.status === 'counted' && (
          <p className="fr-alert fr-alert-success" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <CheckCircle2 size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span><strong>Bulletin compté.</strong> Un bulletin associé à ce reçu est bien dans l’urne de ce vote.</span>
          </p>
        )}
        {state.status === 'missing' && (
          <p className="fr-alert fr-alert-error" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <XCircle size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span><strong>Aucun bulletin trouvé avec ce code pour ce vote.</strong> Vérifie la saisie (et qu’il s’agit du bon vote). Si tu es sûr·e de ton code, signale-le à l’organisation du scrutin.</span>
          </p>
        )}
        {state.status === 'error' && <p className="fr-alert fr-alert-error">{state.error}</p>}
      </div>
      {saved.length > 0 && (
        <div className="fr-stack-sm">
          <p className="fr-help">Reçus gardés sur cet appareil pour ce vote :</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {saved.map(r => (
              <li key={r.code} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{r.code}</code>
                <button type="button" className="fr-btn fr-btn-secondary" onClick={() => { setCode(r.code); check(r.code); }}>Vérifier ce reçu</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Page publique. `formId` (facultatif) remplace l'identifiant lu dans l'adresse. */
export default function BallotCheckPage({ formId: forced }) {
  const route = useRoute();
  const formId = String(forced || route.rest[0] || '').trim().toLowerCase();
  const title = useMemo(() => listReceipts().find(r => r.formId === formId)?.title || '', [formId]);

  if (!isFormUuid(formId)) {
    return (
      <Shell>
        <StateCard icon={FileSearch} title="Lien de vérification incomplet">
          <p className="fr-muted">L’adresse doit être de la forme …/#/bulletin/&lt;identifiant du vote&gt;. Utilise le lien communiqué par l’organisation du scrutin, ou la rubrique « Mes votes » de ton espace.</p>
        </StateCard>
      </Shell>
    );
  }
  return (
    <Shell>
      <div className="fr-stack">
        <StateCard icon={ShieldCheck} title="Vérifier que mon bulletin a été compté">
          {title && <p className="fr-muted">Vote : <strong>{title}</strong></p>}
          <p className="fr-muted">Saisis le code de reçu affiché après ton vote. La vérification ne révèle ni ton identité ni ton choix.</p>
          <ReceiptChecker formId={formId} autoFocus />
        </StateCard>
        <AnonymityNotice variant="public" />
      </div>
    </Shell>
  );
}
