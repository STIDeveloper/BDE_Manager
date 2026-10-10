import { useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowLeft, BadgeCheck, CloudOff, Loader2, PenLine, Search, ShieldAlert, ShieldCheck, ShieldQuestion, Smartphone,
} from 'lucide-react';
import { useStore } from '../../store';
import { useDocsStore } from '../../modules/docs/store';
import { useHash } from '../../core/router';
import {
  hasRemoteVerifier, onVerificationConfigChange, parseVerificationHash, verifyRemote,
} from '../../documents/verification';
import { formatDateTime, normalizeFingerprint, normalizeRef, verifyDocument } from './registryHelpers';

const VIEWS = {
  match: { cls: 'border-emerald-500/40 bg-emerald-500/[0.08]', icon: ShieldCheck, iconCls: 'text-emerald-500', title: 'Document authentique', text: 'La référence existe et l\'empreinte correspond : le contenu n\'a pas été modifié depuis l\'émission.' },
  mismatch: { cls: 'border-red-500/40 bg-red-500/[0.08]', icon: ShieldAlert, iconCls: 'text-red-500', title: 'Empreinte différente', text: 'La référence existe mais l\'empreinte ne correspond pas : le document a pu être modifié, ou l\'empreinte a été mal recopiée.' },
  found: { cls: 'border-blue-500/40 bg-blue-500/[0.08]', icon: BadgeCheck, iconCls: 'text-blue-500', title: 'Référence trouvée', text: 'Saisis l\'empreinte imprimée en pied de page pour vérifier que le contenu est intact.' },
  'not-found': { cls: 'border-amber-500/40 bg-amber-500/[0.08]', icon: ShieldQuestion, iconCls: 'text-amber-500', title: 'Référence inconnue ici', text: 'Aucun document émis sous cette référence dans le registre consulté.' },
};

/**
 * Page publique de vérification d'un document : #/verifier?ref=…&fp=…
 * (lien encodé dans le QR code imprimé sur chaque document émis).
 * Vérifie contre le backend s'il est configuré (verifyRemote), sinon contre
 * le registre LOCAL — qui n'existe que sur l'appareil ayant émis le document.
 */
export default function VerifyPage() {
  const uid = useId();
  const hash = useHash();
  const params = useMemo(() => parseVerificationHash(hash), [hash]);
  const theme = useStore(s => s.theme);
  const documentLog = useStore(s => s.documentLog);
  const signatures = useDocsStore(s => s.signatures);
  const [refInput, setRefInput] = useState(params.ref);
  const [fpInput, setFpInput] = useState(params.fp);
  const [query, setQuery] = useState(params);
  const [remoteOn, setRemoteOn] = useState(hasRemoteVerifier);
  const [remote, setRemote] = useState({ key: '', result: null });

  // Nouveau lien (QR scanné alors que la page est ouverte).
  const [lastHash, setLastHash] = useState(hash);
  if (hash !== lastHash) {
    setLastHash(hash);
    setRefInput(params.ref);
    setFpInput(params.fp);
    setQuery(params);
  }

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme || 'light');
    document.title = 'Vérifier un document — BDE Manager';
  }, [theme]);
  useEffect(() => onVerificationConfigChange(() => setRemoteOn(hasRemoteVerifier())), []);

  const local = useMemo(() => verifyDocument(documentLog, query.ref, query.fp), [documentLog, query]);
  const key = `${normalizeRef(query.ref)}|${normalizeFingerprint(query.fp)}`;

  useEffect(() => {
    if (!remoteOn || !query.ref) return undefined;
    let alive = true;
    verifyRemote(normalizeRef(query.ref), normalizeFingerprint(query.fp)).then(result => {
      if (alive) setRemote({ key, result });
    });
    return () => { alive = false; };
  }, [remoteOn, query, key]);

  const remoteResult = remote.key === key ? remote.result : null;
  const remoteLoading = remoteOn && !!query.ref && remote.key !== key;
  // Le registre local fait foi s'il connaît la référence ; sinon le serveur.
  const result = local.status !== 'not-found' && local.status !== 'empty' ? { ...local, source: 'local' }
    : remoteResult ? { ...remoteResult, source: 'remote' } : { ...local, source: 'local' };
  const view = VIEWS[result.status];
  const entry = result.entry;
  const signature = result.source === 'local' && entry ? signatures[entry.id] : (entry?.signedAt ? { signedAt: entry.signedAt } : null);

  const submit = (e) => {
    e.preventDefault();
    const next = { ref: refInput.trim(), fp: fpInput.trim() };
    setQuery(next);
    const p = new URLSearchParams();
    if (next.ref) p.set('ref', next.ref);
    if (next.fp) p.set('fp', next.fp);
    const target = `#/verifier?${p.toString()}`;
    window.history.replaceState(null, '', target);
    setLastHash(target);
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-base">
      <header className="border-b border-line bg-surface px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <span className="bg-blue-600 text-white px-2 py-1 rounded-md text-xs font-bold" aria-hidden="true">BDE</span>
          <h1 className="text-[15px] font-bold text-ink">Vérification d'un document</h1>
          <a href="#/documents" className="ml-auto btn-secondary py-1.5 text-xs"><ArrowLeft size={14} aria-hidden="true" /> Application</a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-4 space-y-3" aria-labelledby={`${uid}-h`}>
          <h2 id={`${uid}-h`} className="text-sm font-semibold text-ink">Référence et empreinte du document</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${uid}-r`} className="text-[11px] font-semibold text-dim">Référence</label>
              <input id={`${uid}-r`} value={refInput} onChange={(e) => setRefInput(e.target.value)} placeholder="BDE-2026-0007" className="input font-mono uppercase" autoComplete="off" spellCheck={false} />
            </div>
            <div>
              <label htmlFor={`${uid}-f`} className="text-[11px] font-semibold text-dim">Empreinte</label>
              <input id={`${uid}-f`} value={fpInput} onChange={(e) => setFpInput(e.target.value)} placeholder="3F9A-21C4-77B0" className="input font-mono uppercase" autoComplete="off" spellCheck={false} />
            </div>
          </div>
          <button type="submit" className="btn-primary"><Search size={15} aria-hidden="true" /> Vérifier</button>
        </form>

        {remoteLoading && (
          <p className="text-sm text-dim inline-flex items-center gap-2" role="status"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Interrogation du serveur…</p>
        )}

        {view ? (
          <section className={`flex gap-3 items-start rounded-2xl border p-4 ${view.cls}`} role="status" aria-live="polite" data-verify-status={result.status}>
            <view.icon size={26} className={`shrink-0 ${view.iconCls}`} aria-hidden="true" />
            <div className="min-w-0 text-sm">
              <p className="text-lg font-bold text-ink">{view.title}</p>
              <p className="text-dim mt-0.5">{view.text}</p>
              {entry && (
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                  <dt className="text-dim">Document</dt><dd className="text-ink break-words">{entry.title}</dd>
                  <dt className="text-dim">Référence</dt><dd className="text-ink font-mono">{entry.ref}</dd>
                  <dt className="text-dim">Émis le</dt><dd className="text-ink">{formatDateTime(entry.createdAt)}</dd>
                  <dt className="text-dim">Empreinte</dt><dd className="text-ink font-mono">{entry.fingerprint || '—'}</dd>
                  <dt className="text-dim">Signature</dt>
                  <dd className="text-ink">{signature?.signedAt
                    ? <span className="inline-flex items-center gap-1"><PenLine size={13} className="text-emerald-500" aria-hidden="true" /> Signé le {formatDateTime(signature.signedAt)}</span>
                    : 'Aucune signature électronique enregistrée'}</dd>
                </dl>
              )}
              <p className="mt-3 text-[11px] text-dim">
                Source : {result.source === 'remote' ? 'registre en ligne de l\'association' : 'registre enregistré sur cet appareil'}.
              </p>
            </div>
          </section>
        ) : (
          <p className="text-sm text-dim">Saisis la référence imprimée en pied de page (ou scanne le QR code du document).</p>
        )}

        {!remoteOn && (
          <aside className="flex gap-3 items-start rounded-2xl border border-line bg-surface p-4 text-[13px]">
            {documentLog.length ? <Smartphone size={18} className="shrink-0 text-blue-500 mt-0.5" aria-hidden="true" /> : <CloudOff size={18} className="shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />}
            <div className="text-dim">
              <p className="font-semibold text-ink">Vérification locale uniquement</p>
              <p className="mt-0.5">
                Aucun serveur n'est configuré : la vérification compare le document au registre <strong>enregistré sur cet appareil</strong>.
                Elle ne fonctionne donc que sur l'appareil (ou le navigateur) qui a émis le document. Sur un autre appareil, « Référence inconnue » ne signifie pas que le document est faux : demande à l'association de le vérifier.
              </p>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
