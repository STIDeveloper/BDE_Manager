// Tests des moteurs de rendu (PDF vectoriel, HTML, Word) — node:test.
// Exécution : node --test src/documents/render/render.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlockFactory, validateDocument } from '../model.js';
import { renderDocumentsToPdf } from './pdf.js';
import { documentsToHtml } from './html.js';
import {
  pdfSafeText, parseInline, readImageSize, isSafeImageSrc, estimatePageCount, escapeHtml, accentPalette,
} from './shared.js';

// PNG 8×4 valide (RGBA).
export const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAYAAACzzX7wAAAAIElEQVR4nGMQ0aj4L6JRwQDFGGwGfJLICnCaglcSRAMAhQEhdja6QhsAAAAASUVORK5CYII=';

export const ORG = {
  name: 'Bureau des Étudiants de l\'IUT',
  shortName: 'BDE IUT',
  legalForm: 'Association loi 1901',
  rna: 'W931234567',
  siren: '912 345 678',
  address: '140 rue de la Nouvelle France',
  postalCode: '93100',
  city: 'Montreuil',
  email: 'contact@bde-iut.fr',
  phone: '01 23 45 67 89',
  website: 'bde-iut.fr',
  school: 'IUT de Montreuil',
  logo: TINY_PNG,
  stamp: TINY_PNG,
  accentColor: '#4f81f5',
  footerNote: 'Document généré par BDE Manager — toute rature le rend invalide.',
};

const LONG = 'L\'association « BDE » s\'engage à œuvrer pour la vie étudiante : accueil, intégration, événements culturels et sportifs, représentation des étudiants auprès de l\'établissement. Les membres du bureau exercent leurs fonctions à titre bénévole ; les frais engagés sont remboursés sur justificatifs (montant maximal 150,00 €). Il est précisé que chaque membre reçoit une **convocation écrite** au moins quinze jours avant l\'assemblée générale, conformément à l\'article 9 des statuts.';

export function buildFixture(prefix = 'b', title = 'Procès-verbal d\'assemblée générale') {
  const f = createBlockFactory(prefix);
  const rows = Array.from({ length: 60 }, (_, i) => ({
    name: `Membre n°${i + 1} — Étienne Œhlenschläger`,
    role: i % 7 === 0 ? '**Bureau**' : 'Adhérent',
    fee: `${(15 + i).toFixed(2).replace('.', ',')} €`,
  }));
  return {
    meta: { templateId: 'test-fixture', title, fileName: 'Fixture_test', confidential: true },
    blocks: [
      f.title(title, 'Exercice 2026-2027 — séance ordinaire'),
      f.p('Texte avec <script>alert(1)</script> et du **gras** et un emoji 🎉 ici, puis « guillemets » ’ € œ é à ç ≥ 3 → suite ✓.'),
      f.heading('Article 1 — Objet'),
      f.p(LONG),
      f.p(LONG),
      f.heading('Article 2 — Composition', 2),
      f.list(['Premier point **important**', 'Deuxième point avec un texte suffisamment long pour passer à la ligne et vérifier le retrait suspendu des éléments de liste.', 'Troisième point']),
      f.list(['Ordonné un', 'Ordonné deux'], true),
      f.kv([['Nom', 'Jean Dupont'], ['Rôle', 'Trésorier'], ['Adresse', '12 rue des Lilas, 75011 Paris']]),
      f.callout('Information : ce document est conservé au registre des délibérations.', 'info'),
      f.callout('Attention : les montants doivent être justifiés.', 'warning'),
      f.callout('Article L. 123-4 : mention légale reproduite à titre informatif.', 'legal'),
      f.checklist([{ label: 'Statuts à jour', checked: true }, 'Liste des membres', { label: 'Rapport financier', checked: true }]),
      f.blankLines(['Nom : ____________', 'Signature :', '____________']),
      f.p(LONG), f.p(LONG), f.p(LONG), f.p(LONG),
      f.table([
        { key: 'name', label: 'Nom', width: 0.55 },
        { key: 'role', label: 'Rôle', width: 0.25 },
        { key: 'fee', label: 'Cotisation', width: 0.2, align: 'right' },
      ], rows, { caption: 'Liste des membres présents', blankRows: 2 }),
      f.orgChart([
        { title: 'Bureau', color: '#1e3a8a', people: [{ name: 'Alice Martin', role: 'Présidente' }, { name: 'Bob Leroy', role: 'Trésorier' }] },
        { title: 'Pôle Événements', people: [{ name: 'Clarisse Petit', role: 'Responsable' }] },
        { title: 'Pôle Communication', color: '#0f766e', people: [{ name: 'David Roux', role: 'Responsable' }, { name: 'Emma Faure', role: 'Chargée de com' }] },
        { title: 'Pôle Partenariats', people: [{ name: 'Farid Benali', role: 'Responsable' }] },
      ]),
      f.spacer('lg'),
      f.pageBreak(),
      f.p('Après le saut de page.', { align: 'center' }),
      f.small('Mention en petits caractères.'),
      f.placeDate('Montreuil', '10 octobre 2026'),
      f.signatures([
        { label: 'La Présidente', name: 'Alice Martin', role: 'Présidente', image: TINY_PNG, mention: 'Lu et approuvé' },
        { label: 'Le Trésorier', name: 'Bob Leroy', role: 'Trésorier' },
      ]),
    ],
  };
}

const ISSUE = { ref: 'BDE-2026-0042', fingerprint: '3F9A-21C4-77B0', issuedAt: '2026-10-10T09:00:00.000Z' };

test('la fixture est un document valide', () => {
  assert.deepEqual(validateDocument(buildFixture()), []);
});

test('pdfSafeText : WinAnsi uniquement, emoji supprimé', () => {
  assert.equal(pdfSafeText('a\u202Fb\u00A0c'), 'a b c');
  assert.equal(pdfSafeText('x ≥ 3 ≤ 4 → y ✓'), 'x >= 3 <= 4 -> y x');
  assert.equal(pdfSafeText('Bravo 🎉 !'), 'Bravo !');
  assert.equal(pdfSafeText('« œ » ’ – — … € Œ é'), '« œ » ’ – — … € Œ é');
  assert.equal(pdfSafeText('Łukasz Dăscălu'), 'Lukasz Dascalu');
});

test('parseInline : **gras** et marqueurs orphelins', () => {
  assert.deepEqual(parseInline('a **b** c'), [{ text: 'a ', bold: false }, { text: 'b', bold: true }, { text: ' c', bold: false }]);
  assert.deepEqual(parseInline('a ** b'), [{ text: 'a ** b', bold: false }]);
});

test('images : seules les dataURL PNG/JPEG/WebP sont acceptées, dimensions lues', () => {
  assert.equal(isSafeImageSrc(TINY_PNG), true);
  assert.equal(isSafeImageSrc('javascript:alert(1)'), false);
  assert.equal(isSafeImageSrc('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isSafeImageSrc('https://exemple.fr/logo.png'), false);
  assert.deepEqual(readImageSize(TINY_PNG), { width: 8, height: 4 });
});

test('accentPalette : couleur claire assombrie pour le texte', () => {
  const p = accentPalette('#ffe066');
  assert.notEqual(p.textHex, '#ffe066');
  assert.deepEqual(p.onRule, [28, 28, 32]);
  assert.equal(accentPalette('nimportequoi').hex, '#4f81f5');
});

test('PDF : pagination, références, texte assaini (2 documents)', async () => {
  const doc = buildFixture('a');
  const doc2 = { ...buildFixture('c', 'Deuxième document'), meta: { ...buildFixture('c').meta, title: 'Deuxième document', confidential: false, orientation: 'landscape' } };
  const pdf = await renderDocumentsToPdf([doc, doc2], {
    organization: ORG, issues: [ISSUE, null], compress: false,
  });
  const pages = pdf.getNumberOfPages();
  assert.ok(pages >= 8, `au moins 8 pages attendues, obtenu ${pages}`);
  const out = pdf.output();
  assert.ok(out.includes('BDE-2026-0042'), 'référence absente');
  assert.ok(out.includes('3F9A-21C4-77B0'), 'empreinte absente');
  assert.ok(out.includes('Page 1 / '), 'numérotation absente');
  assert.ok(out.includes('CONFIDENTIEL'), 'mention confidentiel absente');
  // Second document : numérotation repartant à 1 et mention d'attente de référence.
  assert.equal(out.split('(Page 1 / ').length - 1, 2, 'numérotation par document');
  assert.ok(out.includes('attribu'), 'mention « Référence attribuée à l\'émission » absente');
  // Pas de texte UTF-16 parasite (« Ø= » = demi-paire de substitution d'un emoji).
  assert.ok(!out.includes('Ø='), 'texte UTF-16 parasite');
  assert.ok(!/\(þÿ/.test(out), 'chaîne UTF-16 (BOM) dans le flux');
  // Caractères WinAnsi correctement encodés : œ (0x9C), € (0x80), « (0xAB).
  assert.ok(out.includes('\u009cuvre'), 'œ mal encodé');
  assert.ok(out.includes('\u0080'), '€ mal encodé');
  assert.ok(out.includes('alert(1)') || out.includes('alert\\(1\\)'), 'texte du paragraphe absent');
  assert.ok(out.includes('/Subtype /Image'), 'images absentes');
});

test('PDF : lecteur de dimensions injectable et image illisible tolérée', async () => {
  const doc = buildFixture('d');
  const pdf = await renderDocumentsToPdf([doc], {
    organization: { ...ORG, logo: 'data:image/png;base64,AAAA' },
    compress: false,
    imageSize: () => null,
  });
  assert.ok(pdf.getNumberOfPages() >= 4);
});

test('HTML : échappement, feuilles, sauts de page, références', () => {
  const doc = buildFixture('a');
  const doc2 = { ...buildFixture('c'), meta: { ...buildFixture('c').meta, title: 'Deuxième <b>doc</b>' } };
  const html = documentsToHtml([doc, doc2], { organization: ORG, issues: [ISSUE, null] });
  assert.ok(!html.includes('<script>alert(1)</script>'), 'balise script non échappée');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<b>doc</b>'));
  assert.equal(html.split('<article class="doc-sheet').length - 1, 2, 'deux feuilles attendues');
  assert.ok(/page-break-after:always|break-after:page/.test(html), 'saut de page absent');
  assert.ok(html.includes('doc-page-break'));
  assert.ok(html.includes('BDE-2026-0042') && html.includes('3F9A-21C4-77B0'));
  assert.ok(html.includes('<strong>gras</strong>'));
  assert.ok(html.includes('<th scope="col"'));
  assert.ok(html.includes('aria-label="Aperçu : '));
  assert.ok(html.includes('src="data:image/png;base64,'));
  assert.ok(html.includes('Référence attribuée à l&#39;émission'));
});

test('HTML : image non sûre rejetée, attributs échappés', () => {
  const f = createBlockFactory();
  const doc = {
    meta: { templateId: 't', title: 'X" onload="alert(1)', fileName: 'x' },
    blocks: [f.signatures([{ label: 'Sig', name: 'N', image: 'javascript:alert(1)' }])],
  };
  const html = documentsToHtml([doc], { organization: { ...ORG, logo: 'data:image/svg+xml;base64,PHN2Zz4=' } });
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('image/svg'));
  assert.ok(!html.includes('" onload="'));
});

test('Word : espaces de noms Office et mise en page A4', () => {
  const html = documentsToHtml([buildFixture()], { organization: ORG, issues: [ISSUE], forWord: true });
  assert.ok(html.includes('xmlns:w="urn:schemas-microsoft-com:office:word"'));
  assert.ok(html.includes('<w:View>Print</w:View>'));
  assert.ok(html.includes('size:21cm 29.7cm'));
  assert.ok(!html.includes('<article'));
  assert.ok(!html.includes('display:flex'));
  assert.ok(html.includes('BDE-2026-0042'));
});

// --- Régressions signalées à la relecture des PDF -------------------------

/** Chaînes littérales des opérateurs Tj du flux PDF non compressé. */
function pdfStrings(out) {
  return [...out.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m => m[1].replace(/\\(.)/g, '$1'));
}

test('régression : espace conservée autour d\'un segment **gras**', async () => {
  const f = createBlockFactory();
  const doc = {
    meta: { templateId: 't', title: 'T', fileName: 't' },
    blocks: [
      f.p('Montant : **30,90 €** (trente euros) versé.', { align: 'left' }),
      f.p('Texte court **gras** (fin).', { align: 'left' }),
      f.p('Ligne justifiée : **30,90 €** (trente euros et quatre-vingt-dix centimes) versée au titre de la cotisation annuelle par le membre désigné, **conformément** aux statuts en vigueur.'),
    ],
  };
  const pdf = await renderDocumentsToPdf([doc], { organization: ORG, compress: false });
  const strings = pdfStrings(pdf.output());
  const joined = strings.join('|');
  // Le texte qui suit un segment gras commence par l'espace séparatrice.
  assert.ok(strings.includes(' (trente euros) versé.'), joined);
  assert.ok(strings.includes(' gras') || strings.includes('gras'), joined);
  assert.ok(strings.includes('Texte court') && strings.includes(' (fin).'), joined);
  // Ligne justifiée : chaque mot non final porte son espace explicite.
  assert.ok(strings.some(s => s === '\u0080 '), `« € » suivi d'une espace attendu : ${joined}`);
});

test('régression : emoji supprimé sans espace de bord (titres, intertitres)', async () => {
  assert.equal(pdfSafeText('🎉 Bureau'), 'Bureau');
  assert.equal(pdfSafeText('Bureau 🎉'), 'Bureau');
  assert.equal(pdfSafeText('Le 🎉 Bureau'), 'Le Bureau');
  const f = createBlockFactory();
  const doc = {
    meta: { templateId: 't', title: '🎉 Titre', fileName: 't' },
    blocks: [f.title('🎉 Bureau'), f.heading('🚀 Pôle'), f.orgChart([{ title: '🎉 Bureau', people: [{ name: '⭐ Alice', role: 'Présidente' }] }])],
  };
  const pdf = await renderDocumentsToPdf([doc], { organization: ORG, compress: false });
  const strings = pdfStrings(pdf.output());
  assert.ok(!strings.some(s => /^ \S/.test(s) && /Bureau|Pôle|Pôle|Alice/.test(s)), strings.join('|'));
  assert.ok(strings.includes('Bureau') && strings.includes('Alice'));
});

test('régression : « CONFIDENTIEL » ne chevauche pas la date d\'émission', async () => {
  const f = createBlockFactory();
  const doc = { meta: { templateId: 't', title: 'T', fileName: 't', confidential: true }, blocks: [f.p('x')] };
  const pdf = await renderDocumentsToPdf([doc], { organization: ORG, issues: [ISSUE], compress: false });
  const out = pdf.output();
  // Positions x (mm → pt) des chaînes du pied de page.
  const pos = (needle) => {
    const re = new RegExp(`([\\d.]+) ([\\d.]+) Td\\s*\\(${needle}`);
    const m = re.exec(out);
    return m ? Number(m[1]) : null;
  };
  const refX = pos('Réf\\. ');
  const confX = pos('CONFIDENTIEL');
  assert.ok(refX !== null && confX !== null, 'positions introuvables');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  const refEnd = refX + pdf.getTextWidth(pdfSafeText(`Réf. ${ISSUE.ref} · Empreinte ${ISSUE.fingerprint} · Émis le 10/10/2026`)) * 72 / 25.4;
  assert.ok(confX > refEnd + 5, `CONFIDENTIEL (${confX}) chevauche la référence (fin ${refEnd})`);
});

/** Numéro de page (1-based) contenant `needle` dans le flux de contenu. */
function pageOf(pdf, needle) {
  for (let p = 1; p <= pdf.getNumberOfPages(); p++) {
    if (pdf.internal.pages[p].join('\n').includes(needle)) return p;
  }
  return -1;
}

test('régression : paragraphe final + « Fait à » + signatures gardés ensemble ; intertitre gardé avec la suite', async () => {
  const filler = 'Paragraphe de remplissage destiné à faire varier la position verticale du bloc final sur la page.';
  for (let n = 0; n < 34; n++) {
    const f = createBlockFactory();
    const blocks = [];
    for (let i = 0; i < n; i++) blocks.push(f.p(filler, { align: 'left' }));
    blocks.push(f.heading('TITREGARDE'));
    blocks.push(f.p('SUITEHEADING texte qui suit immédiatement l\'intertitre sur plusieurs lignes, afin de vérifier que le titre ne reste jamais seul en bas de page lorsque la place manque.', { align: 'left' }));
    for (let i = 0; i < n % 7; i++) blocks.push(f.p(filler, { align: 'left' }));
    blocks.push(f.p('SOUSSIGNEFINAL Je soussigné(e) certifie l\'exactitude des informations ci-dessus et déclare avoir pris connaissance de la charte. Lu et approuvé.', { align: 'left' }));
    blocks.push(f.placeDate('Montreuil', '10 octobre 2026'));
    blocks.push(f.signatures([
      { label: 'Le membre', name: 'SIGNOMUN', mention: 'Lu et approuvé', image: TINY_PNG },
      { label: 'La Présidente', name: 'SIGNOMDEUX' },
    ]));
    const doc = { meta: { templateId: 't', title: 'Charte', fileName: 't' }, blocks };
    const pdf = await renderDocumentsToPdf([doc], { organization: ORG, compress: false });
    const final = pageOf(pdf, 'SOUSSIGNEFINAL');
    assert.equal(pageOf(pdf, 'Montreuil, le'), final, `n=${n} : « Fait à » séparé du paragraphe final`);
    assert.equal(pageOf(pdf, 'SIGNOMUN'), final, `n=${n} : signatures séparées`);
    assert.equal(pageOf(pdf, 'SIGNOMDEUX'), final, `n=${n} : signatures coupées`);
    assert.equal(pageOf(pdf, 'TITREGARDE'), pageOf(pdf, 'SUITEHEADING'), `n=${n} : intertitre orphelin`);
  }
});

test('HTML : espaces autour du gras et titres conservés', () => {
  const f = createBlockFactory();
  const doc = { meta: { templateId: 't', title: 'T', fileName: 't' }, blocks: [f.p('Montant : **30,90 €** (trente)')] };
  const html = documentsToHtml([doc], { organization: ORG });
  assert.ok(html.includes('<strong>30,90 €</strong> (trente)'));
  const word = documentsToHtml([doc], { organization: ORG, forWord: true });
  assert.ok(word.includes('<strong>30,90 €</strong> (trente)'));
});

test('estimatePageCount : ordre de grandeur cohérent', () => {
  assert.ok(estimatePageCount(buildFixture()) >= 3);
  const f = createBlockFactory();
  assert.equal(estimatePageCount({ meta: {}, blocks: [f.p('Court.')] }), 1);
  assert.equal(escapeHtml('<a href="x">\'</a>'), '&lt;a href=&quot;x&quot;&gt;&#39;&lt;/a&gt;');
});


test('brouillon : filigrane « BROUILLON » sur chaque page du PDF et dans le HTML/Word', async () => {
  const b = createBlockFactory();
  const doc = { meta: { templateId: 't', title: 'Brouillon', fileName: 'b' }, blocks: [b.title('Titre'), ...Array.from({ length: 40 }, (_, i) => b.p(`Paragraphe ${i} `.repeat(20)))] };
  const pdf = await renderDocumentsToPdf([doc], { organization: { name: 'Asso' }, draft: true, compress: false });
  const pages = pdf.getNumberOfPages();
  assert.ok(pages >= 2);
  const out = pdf.output();
  assert.equal((out.match(/\(BROUILLON\)/g) || []).length, pages, 'un filigrane par page');
  const normal = (await renderDocumentsToPdf([doc], { organization: { name: 'Asso' }, compress: false })).output();
  assert.ok(!/\(BROUILLON\)/.test(normal), 'pas de filigrane hors brouillon');
  assert.ok(documentsToHtml([doc], { organization: {}, draft: true }).includes('content:"BROUILLON"'));
  assert.ok(documentsToHtml([doc], { organization: {}, draft: true, forWord: true }).includes('BROUILLON — document non émis'));
  assert.ok(!documentsToHtml([doc], { organization: {} }).includes('BROUILLON'));
});
