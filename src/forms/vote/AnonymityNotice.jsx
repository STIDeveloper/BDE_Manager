// ============================================================
// ÉLECTIONS — explication honnête du modèle d'anonymat
// ============================================================
// Reprend les garanties et les limites documentées dans supabase/README.md
// (« Vote anonyme : garanties et limites »). variant 'admin' : carte de
// l'application (Tailwind) ; 'public' : pages publiques (styles fr-*).

const POINTS = [
  ['Trois registres séparés', 'Le serveur range dans trois tables distinctes la liste électorale (empreintes propres à ce vote), le droit de vote consommé (au jour près) et le bulletin (identifiant aléatoire). Aucune colonne commune hormis le vote lui-même, aucun horodatage précis.'],
  ['Personne dans l’application ne peut relier un bulletin à un votant', 'Ni les membres du bureau, ni les administrateurs de l’espace, ni la clé de service du serveur n’ont accès à ces tables : seuls des totaux sortent (participation, résultats).'],
  ['Un seul vote par personne', 'Le droit consommé est unique : un second vote est refusé, même envoyé au même instant.'],
  ['Reçu vérifiable', 'Chaque votant reçoit un code (stocké uniquement sous forme d’empreinte) qui permet de vérifier que son bulletin est dans l’urne, sans révéler son choix.'],
];

const LIMITS = 'Limites résiduelles : la personne qui administre l’infrastructure de la base de données (accès propriétaire au projet Supabase, disque, journaux d’accès avec heure et adresse IP) pourrait, en théorie, rapprocher l’ordre d’arrivée des droits et des bulletins — surtout avec très peu de votants ou un vote isolé dans la journée. Avec un petit nombre de votants, le résultat lui-même peut aussi révéler un choix. Pour une élection à fort enjeu, annonce-le ou recours à un service de vote certifié.';

export default function AnonymityNotice({ variant = 'admin' }) {
  if (variant === 'public') {
    return (
      <section className="fr-card fr-stack-sm" aria-labelledby="anon-title">
        <h2 id="anon-title" className="fr-page-title">Comment ton vote reste secret</h2>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          {POINTS.map(([t, d]) => <li key={t}><strong>{t}.</strong> <span className="fr-muted">{d}</span></li>)}
        </ul>
        <p className="fr-help">{LIMITS}</p>
      </section>
    );
  }
  return (
    <details className="bg-surface border border-line rounded-2xl p-4 group">
      <summary className="cursor-pointer text-sm font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded">
        Modèle d’anonymat : ce qui est garanti, et ce qui ne l’est pas
      </summary>
      <ul className="mt-3 space-y-2 text-sm">
        {POINTS.map(([t, d]) => (
          <li key={t}><span className="font-medium text-ink">{t}.</span> <span className="text-dim">{d}</span></li>
        ))}
      </ul>
      <p className="mt-3 text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 p-2.5">{LIMITS}</p>
      <p className="mt-2 text-[11px] text-muted">Détails techniques : supabase/README.md, section « Vote anonyme : garanties et limites ».</p>
    </details>
  );
}
