// Texte enrichi SÛR : **gras**, *italique*, [libellé](https://lien), liens
// nus http(s)/mailto et retours à la ligne. Aucun HTML interprété : tout est
// rendu en nœuds React (pas de dangerouslySetInnerHTML).

const TOKEN_RX = /(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]{1,200}\]\((?:https?:\/\/|mailto:)[^\s)]{1,500}\))|((?:https?:\/\/)[^\s<>()]{2,500}[^\s<>().,;:!?'"])/g;

function safeHref(url) {
  const s = String(url || '').trim();
  if (/^mailto:[^\s]+$/i.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

function Link({ href, children }) {
  const safe = safeHref(href);
  if (!safe) return <>{children}</>;
  return <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="fr-link">{children}</a>;
}

function inline(text, keyBase) {
  const out = [];
  let last = 0;
  let i = 0;
  for (const m of String(text).matchAll(TOKEN_RX)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) out.push(<strong key={k}>{m[1].slice(2, -2)}</strong>);
    else if (m[2]) out.push(<em key={k}>{m[2].slice(1, -1)}</em>);
    else if (m[3]) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(m[3]);
      out.push(<Link key={k} href={mm[2]}>{mm[1]}</Link>);
    } else if (m[4]) out.push(<Link key={k} href={m[4]}>{m[4]}</Link>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Paragraphes (ligne vide) et retours à la ligne. */
export default function RichText({ text, className = '' }) {
  if (text === null || text === undefined || text === '') return null;
  const paras = String(text).replace(/\r\n?/g, '\n').split(/\n{2,}/);
  return (
    <div className={`fr-rich ${className}`}>
      {paras.map((p, pi) => (
        <p key={pi}>
          {p.split('\n').map((line, li) => (
            <span key={li}>{li > 0 && <br />}{inline(line, `${pi}-${li}`)}</span>
          ))}
        </p>
      ))}
    </div>
  );
}
