import { isPlaceholderMember } from '../../documents/context.js';
// Hook : toutes les données du tableau de bord, dérivées en direct des stores.
import { useMemo, useState } from 'react';
import { useStore } from '../../store.js';
import { useCatalog } from '../../core/useCatalog.js';
import { usePermissionSource } from '../../core/permissions.js';
import { useDocumentContext } from '../../documents/useDocumentContext.js';
import { collectSuggestions } from '../../documents/registry.js';
import { analyzeDriveState } from '../../utils/driveAnalyzer.js';
import { academicYear } from '../../documents/context.js';
import { useEventsStore, upcomingEvents } from '../events/store.js';
import { useAgendaItems } from '../calendar/sources.js';
import { addDays } from '../calendar/agenda.js';
import { useHandoverStore } from '../handover/store.js';
import { handoverCandidates } from '../handover/logic.js';
import { useFinanceSource, useMembershipSource, hasFinance, hasMembership } from './sources.js';
import {
  activeMembers, buildTodo, eventStats, healthScore, membershipStats, poleDistribution,
  recentActivity, treasuryStats, vacancies, ymd,
} from './logic.js';

const DISMISSED_KEY = 'bde.documents.dismissedSuggestions';
function readDismissed() {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function useDashboardData() {
  const [today] = useState(() => new Date());
  const [dismissed] = useState(readDismissed);
  const todayYmd = ymd(today);

  const members = useStore(s => s.members);
  const organization = useStore(s => s.organization);
  const documentLog = useStore(s => s.documentLog);
  const folders = useStore(s => s.folders);
  const drivePermissions = useStore(s => s.drivePermissions);
  const rolePresets = useStore(s => s.rolePresets);
  const catalog = useCatalog();
  const permSource = usePermissionSource();
  const docCtx = useDocumentContext();

  const events = useEventsStore(s => s.events);
  const handovers = useHandoverStore(s => s.handovers);
  const transactions = useFinanceSource(s => s.transactions);
  const financeSettings = useFinanceSource(s => s.settings);
  const memberships = useMembershipSource(s => s.memberships);
  const membershipSettings = useMembershipSource(s => s.settings);
  const agendaItems = useAgendaItems({ today: todayYmd, from: addDays(todayYmd, -60), to: addDays(todayYmd, 90) });

  return useMemo(() => {
    const realMembers = docCtx.members;
    const active = activeMembers(members, today);
    const vac = vacancies(catalog.roleList, active);
    const dismissedSet = new Set(dismissed);
    const suggestions = collectSuggestions(docCtx).filter(s => !dismissedSet.has(`${s.templateId || ''}:${s.id || ''}`));
    const treasury = hasFinance ? treasuryStats(transactions || {}, financeSettings || {}, today) : null;
    const membership = membershipStats(
      { memberships, settings: membershipSettings, available: hasMembership },
      // Même population que la page Adhésions : tous les membres réels (un
      // ancien membre peut renouveler), fiches « poste vacant » exclues.
      hasMembership ? members.filter(m => !isPlaceholderMember(m)) : active,
      today,
    );
    const upcoming = upcomingEvents(events, today);
    const ev = eventStats(upcoming, events, today);
    const candidates = handoverCandidates(realMembers, handovers, documentLog, today)
      .map(c => ({ ...c, roleLabel: catalog.roleLabel(c.member.mainRole) }));
    const handoverList = Object.values(handovers || {});
    const driveDanger = analyzeDriveState({ members: realMembers, folders, drivePermissions, rolePresets }, catalog)
      .filter(a => a.severity === 'danger');
    const health = healthScore({ vac, organization, agendaItems, treasury, financeAvailable: hasFinance, suggestions });
    const todo = buildTodo({
      agendaItems, treasury, financeAvailable: hasFinance, suggestions, driveDanger, membership,
      events: ev, handoverCandidates: candidates, vac, today,
    });
    const me = permSource?.user?.memberId ? realMembers.find(m => m.id === permSource.user.memberId) : null;
    const president = realMembers.find(m => m.mainRole === 'president' && !(m.badges || []).includes('Ancien Membre'));
    return {
      today,
      year: academicYear(today),
      greetingName: (me || president)?.firstName || '',
      organization,
      realMembers,
      active,
      vac,
      suggestions,
      treasury,
      membership,
      upcoming,
      events: ev,
      eventCount: Object.keys(events || {}).length,
      candidates,
      handoversInProgress: handoverList.filter(h => h.status !== 'done'),
      health,
      todo,
      poles: poleDistribution(active, catalog, catalog.poleList),
      activity: recentActivity({ documentLog, transactions, events, handovers, members: realMembers }),
      poleColor: catalog.poleColor,
    };
  }, [today, dismissed, members, organization, documentLog, folders, drivePermissions, rolePresets, catalog, permSource,
    docCtx, events, handovers, transactions, financeSettings, memberships, membershipSettings, agendaItems]);
}
