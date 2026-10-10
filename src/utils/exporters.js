import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PERMISSION_LEVELS, getRootFolder, getFolderTag } from '../store';

function downloadBlob(content, filename, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

function timestamp() {
  return new Date().toISOString().slice(0, 10);
}

function orderedFolders(folders) {
  const result = [];
  const addBranch = (parentId) => {
    folders
      .filter(f => (f.parent ?? null) === parentId)
      .forEach(f => { result.push(f); addBranch(f.id); });
  };
  addBranch(null);
  return result;
}

export function exportMatrixCSV({ members, folders, drivePermissions, includeEmptyRows = true }) {
  const ordered = orderedFolders(folders);
  const header = ['Membre', 'Rôle', 'Email', ...ordered.map(f => `${f.code} ${f.name}`)];
  const rows = members.map(m => {
    const userPerms = drivePermissions[m.id] || {};
    const row = [m.firstName + (m.lastName ? ' ' + m.lastName : ''), m.mainRole || '', m.email || ''];
    ordered.forEach(f => {
      const perm = userPerms[f.id] || 'none';
      row.push(perm === 'none' ? '' : perm.toUpperCase()[0]);
    });
    return row;
  }).filter(r => includeEmptyRows || r.some((c, i) => i > 2 && c));

  const escape = (v) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const csv = [header, ...rows].map(r => r.map(escape).join(',')).join('\n');
  downloadBlob('\ufeff' + csv, `Matrice_Permissions_${timestamp()}.csv`, 'text/csv;charset=utf-8');
}

export function exportMatrixTXT({ members, folders, folderTags, drivePermissions, groupBy = 'folder' }) {
  const ordered = orderedFolders(folders);
  const lines = [];

  lines.push(`🔐 *MATRICE DE PERMISSIONS DRIVE — BDE*`);
  lines.push(`📅 Export du ${new Date().toLocaleDateString('fr-FR')}`);
  lines.push(`👥 ${members.length} membres • 📁 ${folders.length} dossiers`);
  lines.push('');

  if (groupBy === 'folder') {
    ordered.forEach(f => {
      const tagList = (f.tags || []).map(tid => getFolderTag(tid, folderTags)).filter(Boolean);
      const editors = [], commenters = [], readers = [];
      members.forEach(m => {
        const lvl = (drivePermissions[m.id] || {})[f.id] || 'none';
        const name = `${m.firstName}${m.lastName ? ' ' + m.lastName : ''}`;
        if (lvl === 'editor') editors.push(name);
        else if (lvl === 'commenter') commenters.push(name);
        else if (lvl === 'reader') readers.push(name);
      });
      if (editors.length === 0 && commenters.length === 0 && readers.length === 0) return;
      lines.push(`📁 *${f.code} — ${f.name}*`);
      if (tagList.length > 0) lines.push(`   _${tagList.map(t => t.label).join(' • ')}_`);
      if (editors.length > 0)    lines.push(`   ✏️ Éditeurs (${editors.length}) : ${editors.join(', ')}`);
      if (commenters.length > 0) lines.push(`   💬 Commentateurs (${commenters.length}) : ${commenters.join(', ')}`);
      if (readers.length > 0)    lines.push(`   👁 Lecteurs (${readers.length}) : ${readers.join(', ')}`);
      lines.push('');
    });
  } else {
    members.forEach(m => {
      const userPerms = drivePermissions[m.id] || {};
      const grouped = { editor: [], commenter: [], reader: [] };
      ordered.forEach(f => {
        const lvl = userPerms[f.id] || 'none';
        if (lvl !== 'none') grouped[lvl].push(`${f.code} ${f.name}`);
      });
      const total = grouped.editor.length + grouped.commenter.length + grouped.reader.length;
      if (total === 0) return;
      lines.push(`👤 *${m.firstName} ${m.lastName || ''}* — ${m.mainRole || 'Sans rôle'}`);
      if (grouped.editor.length > 0)    lines.push(`   ✏️ Éditeur : ${grouped.editor.join(', ')}`);
      if (grouped.commenter.length > 0) lines.push(`   💬 Commentateur : ${grouped.commenter.join(', ')}`);
      if (grouped.reader.length > 0)    lines.push(`   👁 Lecteur : ${grouped.reader.join(', ')}`);
      lines.push('');
    });
  }

  lines.push(`_Export généré par BDE Manager_`);
  downloadBlob(lines.join('\n'), `Matrice_Permissions_${timestamp()}.txt`);
}

export function exportMatrixPDF({ members, folders, drivePermissions }) {
  const ordered = orderedFolders(folders);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 80, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Matrice de permissions — Google Drive', 40, 40);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('BDE IUT Montreuil • ' + new Date().toLocaleDateString('fr-FR'), 40, 60);

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  const legendeY = 100;
  doc.setFont('helvetica', 'bold');
  doc.text('Légende :', 40, legendeY);
  doc.setFont('helvetica', 'normal');
  doc.text('L = Lecteur   |   C = Commentateur   |   E = Éditeur   |   (vide) = Aucun accès', 90, legendeY);

  const head = [['Membre', 'Rôle', ...ordered.map(f => f.code)]];
  const body = members.map(m => {
    const userPerms = drivePermissions[m.id] || {};
    return [
      `${m.firstName}${m.lastName ? ' ' + m.lastName : ''}`,
      m.mainRole || '',
      ...ordered.map(f => {
        const lvl = userPerms[f.id] || 'none';
        return lvl === 'none' ? '' : lvl.charAt(0).toUpperCase();
      }),
    ];
  });

  autoTable(doc, {
    head, body, startY: 115,
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 90, fontStyle: 'bold' }, 1: { cellWidth: 90 } },
    didDrawPage: () => {
      const pageSize = doc.internal.pageSize;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${doc.internal.getNumberOfPages()} • Généré par BDE Manager`,
        pageSize.getWidth() / 2,
        pageSize.getHeight() - 20,
        { align: 'center' }
      );
    },
  });

  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138);
  doc.text('Détail par dossier', 40, 40);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);

  let y = 65;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  ordered.forEach(f => {
    const editors = [], commenters = [], readers = [];
    members.forEach(m => {
      const lvl = (drivePermissions[m.id] || {})[f.id] || 'none';
      const name = `${m.firstName}${m.lastName ? ' ' + m.lastName : ''}`;
      if (lvl === 'editor') editors.push(name);
      else if (lvl === 'commenter') commenters.push(name);
      else if (lvl === 'reader') readers.push(name);
    });
    if (editors.length === 0 && commenters.length === 0 && readers.length === 0) return;

    if (y > pageHeight - 80) { doc.addPage(); y = 40; }

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 138);
    doc.setFontSize(10);
    doc.text(`${f.code} — ${f.name}`, 40, y);
    y += 13;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (editors.length > 0) {
      doc.setTextColor(5, 150, 105);
      const t = doc.splitTextToSize(`✏️ Éditeurs (${editors.length}) : ${editors.join(', ')}`, pageWidth - 80);
      doc.text(t, 55, y);
      y += t.length * 10;
    }
    if (commenters.length > 0) {
      doc.setTextColor(217, 119, 6);
      const t = doc.splitTextToSize(`💬 Commentateurs (${commenters.length}) : ${commenters.join(', ')}`, pageWidth - 80);
      doc.text(t, 55, y);
      y += t.length * 10;
    }
    if (readers.length > 0) {
      doc.setTextColor(37, 99, 235);
      const t = doc.splitTextToSize(`👁 Lecteurs (${readers.length}) : ${readers.join(', ')}`, pageWidth - 80);
      doc.text(t, 55, y);
      y += t.length * 10;
    }
    y += 10;
  });

  doc.save(`Matrice_Permissions_${timestamp()}.pdf`);
}

export function exportDriveJSON({ members, folders, folderTags, drivePermissions, rolePresets, permissionNotes }) {
  const payload = {
    type: 'bde-drive-matrix',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { members, folders, folderTags, drivePermissions, rolePresets, permissionNotes },
  };
  downloadBlob(
    JSON.stringify(payload, null, 2),
    `Matrice_Drive_${timestamp()}.json`,
    'application/json;charset=utf-8'
  );
}