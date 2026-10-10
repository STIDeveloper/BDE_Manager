import React from 'react';
import { Lightbulb, Target, RotateCw, ShieldCheck, Sparkles } from 'lucide-react';

const CARDS = [
  {
    icon: Target,
    color: 'blue',
    number: '01',
    title: 'Le dossier projet comme unique porte d\'entrée',
    content: (
      <>
        Chaque <strong className="text-ink">membre transversal</strong> (Adrien, Maxence, Clarisse Vasseur, Valentin, Anis, Elif)
        ne reçoit <strong className="text-red-500">AUCUN accès</strong> aux dossiers maîtres 01/02/03.
        On crée systématiquement un <strong className="text-ink">sous-dossier nominatif</strong> dans
        <code className="bg-elevated px-1.5 rounded text-[11px]">02.2 — Projets en cours</code> avec un accès
        <strong className="text-emerald-500"> Éditeur individuel</strong>.
        <br /><br />
        <span className="text-dim italic">→ Traçabilité parfaite, aucune fuite possible vers les dossiers sensibles.</span>
      </>
    ),
  },
  {
    icon: RotateCw,
    color: 'amber',
    number: '02',
    title: 'Rotation automatique à la fin du projet',
    content: (
      <>
        Quand un projet passe dans <code className="bg-elevated px-1.5 rounded text-[11px]">02.3 — Projets terminés</code>,
        on <strong className="text-ink">révoque automatiquement</strong> l'accès Éditeur du membre transversal via le
        <strong className="text-purple-500"> Script Apps Script</strong> (fonction <code className="bg-elevated px-1 rounded text-[11px]">applySharing()</code> relancée).
        <br /><br />
        Le membre repasse en <strong className="text-blue-500">Lecteur</strong> sur son ancien dossier pour consultation historique.
        <br /><br />
        <span className="text-dim italic">→ Évite l'accumulation de permissions "fantômes" au fil des mandats.</span>
      </>
    ),
  },
  {
    icon: ShieldCheck,
    color: 'emerald',
    number: '03',
    title: 'Validation obligatoire par le Responsable de pôle',
    content: (
      <>
        Aucun accès transversal n'est accordé en direct par le Bureau :
        <strong className="text-ink"> le Responsable de pôle concerné</strong> (Jade, Capucine ou Sophia) doit
        <strong className="text-emerald-500"> valider la demande</strong> avant création du dossier nominatif.
        <br /><br />
        Le membre transversal signe électroniquement (Google Form archivé sur <code className="bg-elevated px-1.5 rounded text-[11px]">00.3 — Gouvernance</code>) les
        <strong className="text-ink"> 3 engagements</strong> : confidentialité, non-partage des liens, suppression après clôture.
        <br /><br />
        <span className="text-dim italic">→ Le responsable est comptable devant le Président en cas de problème.</span>
      </>
    ),
  },
];

const COLOR_MAP = {
  blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-500',    num: 'text-blue-500/40' },
  amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-500',   num: 'text-amber-500/40' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-500', num: 'text-emerald-500/40' },
};

export default function Recommendations() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="bg-yellow-500/10 p-3 rounded-xl">
          <Lightbulb size={22} className="text-yellow-500" />
        </div>
        <div>
          <h3 className="text-base font-bold text-ink">Recommandations — Gérer les membres transversaux</h3>
          <p className="text-xs text-dim">3 règles d'or pour concilier souplesse et sécurité de l'arborescence Drive</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {CARDS.map((card, idx) => {
          const Icon = card.icon;
          const colors = COLOR_MAP[card.color];
          return (
            <div key={idx}
              className={`relative bg-surface border ${colors.border} rounded-2xl p-5 hover:border-current transition-colors overflow-hidden`}>
              {/* Numéro géant en filigrane */}
              <div className={`absolute -top-3 -right-2 text-7xl font-black ${colors.num} select-none pointer-events-none`}>
                {card.number}
              </div>

              <div className={`relative inline-flex p-2.5 rounded-xl ${colors.bg} mb-3`}>
                <Icon size={18} className={colors.text} />
              </div>

              <h4 className="relative text-sm font-bold text-ink mb-3 pr-8">
                {card.title}
              </h4>

              <div className="relative text-xs text-dim leading-relaxed">
                {card.content}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-emerald-500/10 border border-line rounded-2xl p-5 flex items-start gap-3">
        <div className="bg-surface p-2 rounded-lg shrink-0">
          <Sparkles size={18} className="text-purple-500" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-ink mb-1">🎯 Bénéfice clé</h4>
          <p className="text-xs text-dim leading-relaxed">
            Cette approche transforme chaque projet en <strong className="text-ink">cellule étanche sur le Drive</strong>, tout en gardant
            le Bureau en <strong className="text-ink">supervision globale</strong> pour les audits de fin de mandat.
            Utilise l'onglet <strong className="text-purple-500">Comparaison</strong> de ton Drive Manager pour comparer les backups
            avant/après chaque passation !
          </p>
        </div>
      </div>
    </div>
  );
}