import { getRootFolder } from '../store';

const BUREAU_KEYWORDS = ['président', 'vice-président', 'trésorier', 'secrétaire'];

function classifyMember(member) {
  // Priorité 1 : la colonne Kanban (source de vérité)
  if (member.columnId === 'direction') return 'bureau';
  if (member.columnId === 'com')       return 'com';
  if (member.columnId === 'event')     return 'event';
  if (member.columnId === 'part')      return 'part';
  if (member.columnId === 'transverse') return 'transverse';

  // Fallback : classification par rôle
  const r = (member.mainRole || '').toLowerCase();
  if (BUREAU_KEYWORDS.some(k => r.includes(k))) return 'bureau';
  if (r.includes('respo com') || r.includes('respo insta') || r.includes('respo tiktok')) return 'com';
  if (r.includes('respo event') || r.includes('respo sport')) return 'event';
  if (r.includes('respo partenariat')) return 'part';
  return 'transverse';
}

function getMemberFolders(member, rolePresets, folders) {
  const preset = rolePresets[member.mainRole] || {};
  const editorIds = Object.entries(preset)
    .filter(([_, lvl]) => lvl === 'editor')
    .map(([fid]) => fid);
  return editorIds
    .map(fid => folders.find(f => f.id === fid))
    .filter(Boolean)
    .map(f => f.code);
}

function escapeMermaid(str) {
  return String(str || '')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

// Raccourcit le nom pour l'ID Mermaid
function makeId(member) {
  return 'M_' + member.id.replace(/[^a-zA-Z0-9]/g, '_');
}

export function generateOrgChart({ members, folders, rolePresets }) {
  const classified = { bureau: [], com: [], event: [], part: [], transverse: [] };
  members.forEach(m => classified[classifyMember(m)].push(m));

  const lines = [];

  // Styles
  lines.push('graph TD');
  lines.push('    classDef bureau fill:#7f1d1d,stroke:#fca5a5,stroke-width:2px,color:#fff,font-weight:bold');
  lines.push('    classDef com fill:#1e3a8a,stroke:#93c5fd,stroke-width:2px,color:#fff');
  lines.push('    classDef comSub fill:#1e40af,stroke:#60a5fa,stroke-width:1px,color:#fff');
  lines.push('    classDef event fill:#4c1d95,stroke:#c4b5fd,stroke-width:2px,color:#fff');
  lines.push('    classDef eventSub fill:#5b21b6,stroke:#a78bfa,stroke-width:1px,color:#fff');
  lines.push('    classDef part fill:#78350f,stroke:#fbbf24,stroke-width:2px,color:#fff');
  lines.push('    classDef transverse fill:#065f46,stroke:#6ee7b7,stroke-width:2px,color:#fff');
  lines.push('');

  // Racine
  lines.push(`    BDE["🏛️ BDE IUT MONTREUIL<br/><i>${members.length} membres</i>"]:::bureau`);
  lines.push('');

  // BUREAU
  if (classified.bureau.length > 0) {
    lines.push('    subgraph BUREAU["🔒 00 — Bureau Stratégique"]');
    classified.bureau.forEach(m => {
      const foldersStr = getMemberFolders(m, rolePresets, folders).join(', ') || '—';
      const label = `👑 ${m.firstName} ${m.lastName || ''}<br/><b>${m.mainRole || 'Membre'}</b><br/>📁 Drive: ${foldersStr}`;
      lines.push(`        ${makeId(m)}["${escapeMermaid(label)}"]:::bureau`);
    });
    lines.push('    end');
    lines.push('    BDE --> BUREAU');
    lines.push('');
  }

  // PÔLE COM
  if (classified.com.length > 0) {
    lines.push('    subgraph COM["📣 01 — Pôle Communication"]');
    const respos = classified.com.filter(m => (m.mainRole || '').startsWith('Respo'));
    const charges = classified.com.filter(m => !(m.mainRole || '').startsWith('Respo'));
    respos.forEach(m => {
      const foldersStr = getMemberFolders(m, rolePresets, folders).join(', ') || '—';
      const label = `🎯 ${m.firstName} ${m.lastName || ''}<br/><b>${m.mainRole}</b><br/>📁 Drive: ${foldersStr}`;
      lines.push(`        ${makeId(m)}["${escapeMermaid(label)}"]:::com`);
    });
    if (charges.length > 0) {
      const names = charges.map(m => `${m.firstName} ${m.lastName || ''}`.trim()).join(' • ');
      lines.push(`        COM_CHARGES["👥 Chargés de projet<br/><b>${escapeMermaid(names)}</b><br/>📁 Drive: sous-dossiers projet"]:::comSub`);
    }
    lines.push('    end');
    lines.push('    BDE --> COM');
    // Hiérarchie interne
    if (respos[0] && respos.length > 1) {
      respos.slice(1).forEach(r => {
        lines.push(`    ${makeId(respos[0])} --> ${makeId(r)}`);
      });
    }
    if (respos[0] && charges.length > 0) {
      lines.push(`    ${makeId(respos[0])} --> COM_CHARGES`);
    }
    lines.push('');
  }

  // PÔLE EVENT
  if (classified.event.length > 0) {
    lines.push('    subgraph EVENT["🎉 02 — Pôle Événementiel"]');
    const respos = classified.event.filter(m => (m.mainRole || '').startsWith('Respo'));
    const charges = classified.event.filter(m => !(m.mainRole || '').startsWith('Respo'));
    respos.forEach(m => {
      const foldersStr = getMemberFolders(m, rolePresets, folders).join(', ') || '—';
      const label = `🎪 ${m.firstName} ${m.lastName || ''}<br/><b>${m.mainRole}</b><br/>📁 Drive: ${foldersStr}`;
      lines.push(`        ${makeId(m)}["${escapeMermaid(label)}"]:::event`);
    });
    if (charges.length > 0) {
      const names = charges.map(m => `${m.firstName} ${m.lastName || ''}`.trim()).join(' • ');
      lines.push(`        EVENT_CHARGES["👥 Chargés de projet<br/><b>${escapeMermaid(names)}</b><br/>📁 Drive: sous-dossiers projet"]:::eventSub`);
    }
    lines.push('    end');
    lines.push('    BDE --> EVENT');
    if (respos[0] && respos.length > 1) {
      respos.slice(1).forEach(r => lines.push(`    ${makeId(respos[0])} --> ${makeId(r)}`));
    }
    if (respos[0] && charges.length > 0) {
      lines.push(`    ${makeId(respos[0])} --> EVENT_CHARGES`);
    }
    lines.push('');
  }

  // PÔLE PARTENARIAT
  if (classified.part.length > 0) {
    lines.push('    subgraph PART["🤝 03 — Pôle Partenariat"]');
    classified.part.forEach(m => {
      const foldersStr = getMemberFolders(m, rolePresets, folders).join(', ') || '—';
      const label = `💼 ${m.firstName} ${m.lastName || ''}<br/><b>${m.mainRole}</b><br/>📁 Drive: ${foldersStr}`;
      lines.push(`        ${makeId(m)}["${escapeMermaid(label)}"]:::part`);
    });
    lines.push('    end');
    lines.push('    BDE --> PART');
    lines.push('');
  }

  // TRANSVERSAUX
  if (classified.transverse.length > 0) {
    lines.push('    subgraph TRANSVERSE["🧩 Membres transversaux"]');
    classified.transverse.forEach(m => {
      const label = `${m.firstName} ${m.lastName || ''}<br/><i>${m.mainRole || 'Membre'}</i>`;
      lines.push(`        ${makeId(m)}["${escapeMermaid(label)}"]:::transverse`);
    });
    lines.push('    end');
    lines.push('    BDE -.-> TRANSVERSE');
  }

  return lines.join('\n');
}