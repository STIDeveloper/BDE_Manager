// ============================================================
// STUDIO DOCUMENTS — ICÔNES DES MODÈLES
// ============================================================
// Les modèles désignent leur icône par son NOM lucide (chaîne). Importer
// tout lucide-react (`import * as Icons`) ajouterait ~1 000 icônes au
// bundle : on maintient donc une table explicite. Une icône absente
// retombe sur FileText (aucune erreur).

import { createElement } from 'react';
import {
  Archive, Award, BadgeCheck, Banknote, Book, BookOpen, BookUser, Briefcase, Building2, Calculator,
  Calendar, CalendarCheck, CalendarClock, CalendarDays, Camera, ClipboardCheck, ClipboardList,
  ClipboardPen, Coins, Contact, Crown, Database, Euro, Eye, FileBadge, FileCheck, FileLock,
  FilePen, FileSignature, FileSpreadsheet, FileText, FileUser, Fingerprint, FolderLock, FolderTree,
  Gavel, GraduationCap, HandCoins, Handshake, HeartHandshake, IdCard, KeyRound, Landmark, LayoutGrid,
  ListChecks, ListOrdered, Lock, LogOut, FolderKey, Mail, Medal, Megaphone, Network, NotebookPen, PartyPopper, PenLine,
  PiggyBank, Presentation, Receipt, ReceiptText, Repeat, Scale, School, ScrollText, Shield,
  ShieldAlert, ShieldCheck, Signature, Sparkles, Stamp, Ticket, Trophy, UserCheck, UserCog, UserMinus,
  UserPlus, Users, UsersRound, Vote, Wallet, Workflow,
} from 'lucide-react';

const ICONS = {
  Archive, Award, BadgeCheck, Banknote, Book, BookOpen, BookUser, Briefcase, Building2, Calculator,
  Calendar, CalendarCheck, CalendarClock, CalendarDays, Camera, ClipboardCheck, ClipboardList,
  ClipboardPen, Coins, Contact, Crown, Database, Euro, Eye, FileBadge, FileCheck, FileLock,
  FilePen, FileSignature, FileSpreadsheet, FileText, FileUser, Fingerprint, FolderLock, FolderTree,
  Gavel, GraduationCap, HandCoins, Handshake, HeartHandshake, IdCard, KeyRound, Landmark, LayoutGrid,
  ListChecks, ListOrdered, Lock, LogOut, FolderKey, Mail, Medal, Megaphone, Network, NotebookPen, PartyPopper, PenLine,
  PiggyBank, Presentation, Receipt, ReceiptText, Repeat, Scale, School, ScrollText, Shield,
  ShieldAlert, ShieldCheck, Signature, Sparkles, Stamp, Ticket, Trophy, UserCheck, UserCog, UserMinus,
  UserPlus, Users, UsersRound, Vote, Wallet, Workflow,
};

/** Composant d'icône lucide à partir de son nom (repli : FileText). */
export function iconFor(name) {
  return ICONS[name] || FileText;
}

/** <TemplateIcon name="BadgeCheck" size={16} /> — icône d'un modèle par son nom. */
export function TemplateIcon({ name, ...props }) {
  return createElement(iconFor(name), props);
}

/**
 * Teintes par catégorie (classes Tailwind complètes, détectées au build).
 * tile : pastille d'icône ; dot : puce ; ring : bordure active.
 */
export const CATEGORY_TONES = {
  membres:      { tile: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', dot: 'bg-blue-500', bar: 'from-blue-500/70' },
  gouvernance:  { tile: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', dot: 'bg-violet-500', bar: 'from-violet-500/70' },
  organisation: { tile: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400', dot: 'bg-cyan-500', bar: 'from-cyan-500/70' },
  partenariats: { tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', bar: 'from-amber-500/70' },
  rgpd:         { tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', bar: 'from-emerald-500/70' },
};

export const toneFor = (category) => CATEGORY_TONES[category] || CATEGORY_TONES.membres;

/** Damier (aperçu de la transparence d'une image). */
export const CHECKER = 'bg-[conic-gradient(#e5e7eb_25%,#fff_0_50%,#e5e7eb_0_75%,#fff_0)] [background-size:14px_14px]';
