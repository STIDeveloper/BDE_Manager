// ============================================================
// STUDIO DOCUMENTS — RENDU : arbre de balisage neutre
// ============================================================
// Le document (AST, voir ../model.js) est d'abord converti en un arbre de
// nœuds neutres { tag, attrs, children, edit? }. Cet arbre est ensuite :
//   - sérialisé en HTML échappé (impression, Word)       → treeToHtml()
//   - converti en éléments React (aperçu, retouche)       → DocumentView.jsx
// L'aperçu et les exports partagent ainsi exactement le même balisage.
// Aucune chaîne fournie par l'utilisateur n'est jamais interprétée comme HTML.
// ============================================================

import {
  parseInline, str, letterheadInfo, footerIdentity, referenceLine, isSafeImageSrc,
  readImageSize, fitBox, safeHex, stampSlotIndex, accentPalette,
} from './shared.js';

const VOID_TAGS = new Set(['img', 'br', 'col', 'hr']);
const PX_PER_MM = 96 / 25.4;

/** Crée un nœud. Les enfants faux / vides sont ignorés, les tableaux aplatis. */
export function h(tag, attrs, ...children) {
  const flat = [];
  const push = (c) => {
    if (c === null || c === undefined || c === false || c === '') return;
    if (Array.isArray(c)) c.forEach(push);
    else flat.push(typeof c === 'number' ? String(c) : c);
  };
  children.forEach(push);
  return { tag, attrs: attrs || {}, children: flat };
}

/** Texte riche (`**gras**`, retours à la ligne) → nœuds. */
export function richNodes(text) {
  const out = [];
  parseInline(text).forEach((seg) => {
    const parts = seg.text.split('\n');
    const nodes = [];
    parts.forEach((p, i) => {
      if (i > 0) nodes.push(h('br', null));
      if (p) nodes.push(p);
    });
    if (seg.bold) out.push(h('strong', null, nodes));
    else out.push(...nodes);
  });
  return out;
}

const textOf = (overrides, b) => (overrides && Object.prototype.hasOwnProperty.call(overrides, b.id) ? str(overrides[b.id]) : str(b.text));

function imgNode(src, { className, alt, maxWmm, maxHmm, forWord }) {
  if (!isSafeImageSrc(src)) return null;
  const attrs = { class: className, src, alt };
  if (forWord) {
    // Word ignore max-width / max-height : dimensions explicites en pixels.
    const box = fitBox(readImageSize(src), maxWmm, maxHmm);
    attrs.width = String(Math.round(box.width * PX_PER_MM));
    attrs.height = String(Math.round(box.height * PX_PER_MM));
  }
  return h('img', attrs);
}

// ------------------------------------------------------------
// Blocs
// ------------------------------------------------------------

function editableAttrs(b, label, ctx) {
  if (!ctx.editable || !b.editable) return { attrs: {}, edit: null };
  return { attrs: { 'data-block-id': b.id }, edit: { id: b.id, label } };
}

function blockNode(b, ctx) {
  const { overrides, forWord, organization } = ctx;
  switch (b?.type) {
    case 'title': {
      const text = textOf(overrides, b);
      const ed = editableAttrs(b, 'Titre modifiable', ctx);
      const title = h('h1', { class: 'doc-title', ...ed.attrs }, richNodes(text));
      if (ed.edit) title.edit = { ...ed.edit, raw: text };
      return h('div', { class: 'doc-title-block' },
        title,
        b.subtitle ? h('p', { class: 'doc-subtitle' }, richNodes(b.subtitle)) : null,
        h('div', { class: 'doc-title-bar', 'aria-hidden': 'true' }, forWord ? '\u00A0' : null));
    }
    case 'heading':
      return Number(b.level) === 2
        ? h('h3', { class: 'doc-h2' }, richNodes(b.text))
        : h('h2', { class: 'doc-h1' }, richNodes(b.text));
    case 'paragraph': {
      const text = textOf(overrides, b);
      const align = ['left', 'justify', 'center', 'right'].includes(b.align) ? b.align : 'left';
      const tone = ['muted', 'small'].includes(b.tone) ? b.tone : 'normal';
      const ed = editableAttrs(b, 'Paragraphe modifiable', ctx);
      const node = h('p', { class: `doc-p doc-align-${align} doc-tone-${tone}`, ...ed.attrs }, richNodes(text));
      if (ed.edit) node.edit = { ...ed.edit, raw: text };
      return node;
    }
    case 'list': {
      const items = (b.items || []).filter(i => str(i) !== '');
      if (!items.length) return null;
      return h(b.ordered ? 'ol' : 'ul', { class: 'doc-list' }, items.map(it => h('li', null, richNodes(it))));
    }
    case 'keyValue': {
      const rows = (b.rows || []).filter(r => Array.isArray(r));
      if (!rows.length) return null;
      return h('table', { class: 'doc-kv' }, h('tbody', null, rows.map(([k, v]) => h('tr', null,
        h('th', { scope: 'row' }, richNodes(k)),
        h('td', null, richNodes(v))))));
    }
    case 'table': {
      const cols = (b.columns || []).filter(Boolean);
      if (!cols.length) return null;
      const alignOf = (c) => (['left', 'center', 'right'].includes(c.align) ? c.align : 'left');
      const rows = (b.rows || []).map(r => h('tr', null, cols.map(c => h('td', { style: `text-align:${alignOf(c)}` }, richNodes(str(r?.[c.key]))))));
      const blanks = Array.from({ length: Math.max(0, Math.min(200, Number(b.blankRows) || 0)) }, () => h('tr', { class: 'doc-blank-row' }, cols.map(() => h('td', null, '\u00A0'))));
      return h('table', { class: `doc-table${b.dense ? ' doc-table-dense' : ''}` },
        b.caption ? h('caption', null, richNodes(b.caption)) : null,
        h('colgroup', null, cols.map(c => (Number(c.width) > 0 ? h('col', { style: `width:${Math.round(Number(c.width) * 1000) / 10}%` }) : h('col', null)))),
        h('thead', null, h('tr', null, cols.map(c => h('th', { scope: 'col', style: `text-align:${alignOf(c)}` }, richNodes(c.label))))),
        h('tbody', null, rows, blanks));
    }
    case 'signatures': {
      const slots = (b.slots || []).filter(Boolean);
      if (!slots.length) return null;
      const stampAt = stampSlotIndex(slots, organization);
      const perRow = 3;
      const rows = [];
      for (let i = 0; i < slots.length; i += perRow) rows.push(slots.slice(i, i + perRow));
      const cols = slots.length === 1 ? 2 : Math.min(perRow, slots.length);
      const width = `${Math.floor(1000 / cols) / 10}%`;
      return h('table', { class: 'doc-signatures', role: 'presentation' }, h('tbody', null, rows.map((row, ri) => h('tr', null,
        slots.length === 1 ? h('td', { class: 'doc-sig-spacer', style: `width:${width}` }, forWord ? '\u00A0' : null) : null,
        row.map((s, si) => {
          const index = ri * perRow + si;
          return h('td', { class: 'doc-sig', style: `width:${width}` },
            h('div', { class: 'doc-sig-label' }, richNodes(s.label)),
            s.mention ? h('div', { class: 'doc-sig-mention' }, richNodes(s.mention)) : null,
            h('div', { class: 'doc-sig-area' },
              imgNode(s.image, { className: 'doc-sig-img', alt: `Signature${s.name ? ` de ${str(s.name)}` : ''}`, maxWmm: 52, maxHmm: 22, forWord }),
              index === stampAt ? imgNode(organization.stamp, { className: 'doc-stamp', alt: 'Cachet de l\'association', maxWmm: 28, maxHmm: 24, forWord }) : null,
              forWord && !isSafeImageSrc(s.image) ? '\u00A0' : null),
            h('div', { class: 'doc-sig-name' }, s.name ? richNodes(s.name) : '\u00A0'),
            s.role ? h('div', { class: 'doc-sig-role' }, richNodes(s.role)) : null);
        }),
        // Complète la dernière ligne pour garder des colonnes égales.
        slots.length > 1 && row.length < cols ? Array.from({ length: cols - row.length }, () => h('td', { class: 'doc-sig', style: `width:${width}` })) : null))));
    }
    case 'placeDate': {
      const city = str(b.city).trim();
      const date = str(b.date).trim();
      const text = city ? `Fait à ${city}${date ? `, le ${date}` : ''}` : `Fait le ${date}`;
      return h('p', { class: 'doc-placedate' }, text);
    }
    case 'callout': {
      const tone = ['info', 'warning', 'legal'].includes(b.tone) ? b.tone : 'info';
      return h('div', { class: `doc-callout doc-callout-${tone}`, role: 'note' }, richNodes(b.text));
    }
    case 'checklist': {
      const items = (b.items || []).filter(Boolean);
      if (!items.length) return null;
      return h('ul', { class: 'doc-checklist' }, items.map(it => h('li', null,
        h('span', { class: `doc-box${it.checked ? ' doc-box-checked' : ''}`, role: 'img', 'aria-label': it.checked ? 'Coché' : 'Non coché' }, it.checked ? '✓' : (forWord ? '\u00A0' : null)),
        richNodes(it.label))));
    }
    case 'blankLines': {
      const lines = (b.lines || []).map(str);
      if (!lines.length) return null;
      return h('table', { class: 'doc-blanks', role: 'presentation' }, h('tbody', null, lines.map((l) => {
        const label = l.replace(/[\s_.…]{3,}$/u, '').trim();
        return h('tr', null,
          label ? h('td', { class: 'doc-blank-label' }, richNodes(label)) : null,
          h('td', { class: 'doc-blank-fill', ...(label ? {} : { colspan: '2' }) }, '\u00A0'));
      })));
    }
    case 'orgChart': {
      const groups = (b.groups || []).filter(Boolean);
      if (!groups.length) return null;
      const perRow = ctx.landscape ? 4 : 3;
      const rows = [];
      for (let i = 0; i < groups.length; i += perRow) rows.push(groups.slice(i, i + perRow));
      const width = `${Math.floor(1000 / perRow) / 10}%`;
      return h('table', { class: 'doc-org', role: 'presentation' }, h('tbody', null, rows.map(row => h('tr', null,
        row.map(g => {
          const color = safeHex(g.color, ctx.accentHex);
          return h('td', { class: 'doc-org-cell', style: `width:${width}` },
            h('div', { class: 'doc-org-card', style: `border-top-color:${color}` },
              h('div', { class: 'doc-org-title' }, richNodes(g.title)),
              h('ul', { class: 'doc-org-people' }, (g.people || []).map(p => h('li', null,
                h('span', { class: 'doc-org-name' }, richNodes(p?.name)),
                p?.role ? h('span', { class: 'doc-org-role' }, richNodes(p.role)) : null)))));
        }),
        row.length < perRow ? Array.from({ length: perRow - row.length }, () => h('td', { class: 'doc-org-cell', style: `width:${width}` })) : null))));
    }
    case 'spacer': {
      const size = ['sm', 'md', 'lg'].includes(b.size) ? b.size : 'md';
      return h('div', { class: `doc-spacer doc-spacer-${size}`, 'aria-hidden': 'true' }, forWord ? '\u00A0' : null);
    }
    case 'pageBreak':
      if (forWord) return h('br', { clear: 'all', style: 'mso-special-character:line-break;page-break-before:always' });
      return h('div', { class: 'doc-page-break', role: 'separator', 'aria-label': 'Saut de page' }, h('span', null, 'Saut de page'));
    default:
      return null;
  }
}

// ------------------------------------------------------------
// En-tête et pied de page
// ------------------------------------------------------------

function letterheadNode(org, forWord) {
  const info = letterheadInfo(org);
  return h('header', { class: 'doc-letterhead' },
    h('table', { class: 'doc-lh', role: 'presentation' }, h('tbody', null, h('tr', null,
      info.logo ? h('td', { class: 'doc-lh-logo' }, imgNode(info.logo, { className: 'doc-logo', alt: `Logo — ${info.name}`, maxWmm: 34, maxHmm: 20, forWord })) : null,
      h('td', { class: 'doc-lh-id' },
        h('div', { class: 'doc-lh-name' }, info.name),
        info.subtitle ? h('div', { class: 'doc-lh-sub' }, info.subtitle) : null,
        info.address ? h('div', { class: 'doc-lh-addr' }, info.address) : null),
      info.contacts.length ? h('td', { class: 'doc-lh-contact' }, info.contacts.flatMap((c, i) => (i ? [h('br', null), c] : [c]))) : null))),
    h('div', { class: 'doc-rule', 'aria-hidden': 'true' }, forWord ? '\u00A0' : null));
}

function footerNode(doc, org, issue) {
  return h('footer', { class: 'doc-footer' },
    org.footerNote ? h('div', { class: 'doc-footer-note' }, str(org.footerNote)) : null,
    h('div', { class: 'doc-footer-id' }, footerIdentity(org)),
    h('table', { class: 'doc-footer-meta', role: 'presentation' }, h('tbody', null, h('tr', null,
      h('td', { class: 'doc-footer-ref' }, referenceLine(issue)),
      h('td', { class: 'doc-footer-conf' }, doc?.meta?.confidential ? 'CONFIDENTIEL' : '\u00A0'),
      h('td', { class: 'doc-footer-page' }, str(doc?.meta?.title))))));
}

/**
 * Construit l'arbre d'une feuille.
 * @param {object} doc
 * @param {object} opts { organization, issue, editable, overrides, forWord, last }
 */
export function buildSheet(doc, { organization = {}, issue = null, editable = false, overrides = null, forWord = false, last = true, accentVars = false } = {}) {
  const org = organization || {};
  const landscape = doc?.meta?.orientation === 'landscape';
  const palette = accentPalette(org.accentColor);
  const ctx = { organization: org, overrides, editable, forWord, landscape, accentHex: palette.hex };
  const blocks = (doc?.blocks || []).map(b => blockNode(b, ctx)).filter(Boolean);
  const title = str(doc?.meta?.title) || 'Document';
  const attrs = {
    class: `doc-sheet${landscape ? ' doc-landscape' : ''}${last ? ' doc-last' : ''}`,
    'aria-label': `Aperçu : ${title}`,
    lang: 'fr',
  };
  if (accentVars) {
    attrs.style = `--doc-accent:${palette.hex};--doc-accent-text:${palette.textHex};--doc-accent-soft:${palette.softHex};--doc-on-accent:${palette.onRuleHex}`;
  }
  const head = letterheadNode(org, forWord);
  const foot = footerNode(doc, org, issue);
  if (forWord) return h('article', attrs, head, blocks, foot);
  // Cadre en tableau : à l'impression, <thead>/<tfoot> se répètent sur
  // chaque page (marge haute + pied de page de CE document).
  return h('article', attrs,
    h('table', { class: 'doc-frame', role: 'presentation' },
      h('thead', null, h('tr', null, h('td', null, h('div', { class: 'doc-frame-top' })))),
      h('tbody', null, h('tr', null, h('td', { class: 'doc-body' }, head, blocks))),
      h('tfoot', null, h('tr', null, h('td', null, foot)))));
}

// ------------------------------------------------------------
// Sérialisation HTML
// ------------------------------------------------------------

const ATTR_NAME_RE = /^[a-z][a-z0-9-]*$/;

function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\u00A0/g, '&nbsp;');
}
function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Sérialise un arbre en HTML (tout texte et attribut est échappé). */
export function treeToHtml(node, tagMap = null) {
  if (typeof node === 'string') return escapeText(node);
  if (!node || !node.tag) return '';
  const tag = (tagMap && tagMap[node.tag]) || node.tag;
  const attrs = Object.entries(node.attrs || {})
    .filter(([k, v]) => ATTR_NAME_RE.test(k) && v !== null && v !== undefined && v !== false)
    .filter(([k, v]) => k !== 'src' || isSafeImageSrc(v))
    .map(([k, v]) => ` ${k}="${escapeAttr(String(v))}"`).join('');
  if (VOID_TAGS.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${node.children.map(c => treeToHtml(c, tagMap)).join('')}</${tag}>`;
}
