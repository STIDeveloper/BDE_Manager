import { resolveCatalog } from './config.js';
import { poleLabelIn } from '../core/catalog.js';

/**
 * Exporte un SVG (chaîne) en fichier téléchargeable.
 */
export function downloadSvg(svgString, filename = 'organigramme.svg') {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Convertit un SVG en PNG et le télécharge.
 * @param {SVGElement} svgEl
 * @param {string} filename
 * @param {string} bgColor  Couleur de fond (ex. '#09090b' ou '#ffffff')
 * @param {number} [scale=2]
 */
export async function downloadPng(svgEl, filename = 'organigramme.png', bgColor = '#09090b', scale = 2) {
  const bbox = svgEl.getBoundingClientRect();
  const w = bbox.width || 1200;
  const h = bbox.height || 800;

  const clone = svgEl.cloneNode(true);
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const svgStr = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Canvas toBlob a échoué'));
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(pngUrl);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

/**
 * Lignes du CSV d'affectations (pur, testable sans DOM).
 * Pôle exporté par LIBELLÉ ; candidats non placés marqués « non placé ».
 * @param {object} [opts]  { catalog }
 * @returns {string[][]}
 */
export function buildAssignmentsRows(scenario, candidates, opts = {}) {
  const cat = resolveCatalog(opts.catalog);
  const roleLabel = (roleId) => (roleId ? (cat.roles?.[roleId]?.label || roleId) : '');
  const poleLabel = (roleId) => {
    const role = roleId ? cat.roles?.[roleId] : null;
    return role ? poleLabelIn(cat, role.pole) : '';
  };
  const byId = new Map(candidates.map(c => [c.id, c]));
  const header = ['Candidat', 'Email', 'Rôle', 'Pôle', 'Score', 'Rang', 'Verrouillé'];
  const rows = [header];

  // Candidats placés puis non placés (slotId null)
  const withCandidate = scenario.assignments.filter(a => a.candidateId);
  const placed = withCandidate.filter(a => a.slotId)
    .sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0));
  const unplaced = withCandidate.filter(a => !a.slotId);
  [...placed, ...unplaced].forEach(a => {
    const c = byId.get(a.candidateId);
    const rank = a.score?.rank;
    rows.push([
      c ? `${c.firstName} ${c.lastName}` : '',
      '', // email exclu par défaut (confidentialité)
      roleLabel(a.roleId),
      poleLabel(a.roleId),
      a.slotId ? (a.score?.total || 0).toFixed(1) : '',
      !a.slotId ? 'non placé'
        : rank === 1 ? '1er' : rank === 2 ? '2e' : rank === 3 ? '3e' : rank === 'discover' ? 'à découvrir' : 'renfort',
      a.locked ? 'OUI' : '',
    ]);
  });

  // Slots vacants
  scenario.assignments.filter(a => a.vacant).forEach(a => {
    rows.push(['— VACANT —', '', roleLabel(a.roleId), poleLabel(a.roleId), '', '', '']);
  });
  return rows;
}

/**
 * Exporte les affectations en CSV.
 * @param {object} [opts]  { catalog }
 */
export function downloadAssignmentsCsv(scenario, candidates, filename = 'affectations.csv', opts = {}) {
  const rows = buildAssignmentsRows(scenario, candidates, opts);

  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };

  const csv = '\ufeff' + rows.map(r => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Exporte une fiche membre individuelle en TXT.
 */
export function downloadMemberCard(text, candidate, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `fiche_${candidate.firstName}_${candidate.lastName}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}