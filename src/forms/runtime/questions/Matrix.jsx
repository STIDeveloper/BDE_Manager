// Grille lignes × colonnes (choix unique ou multiple par ligne) :
// tableau en large, cartes empilées en étroit (requête de conteneur).
// Les deux rendus partagent le même état ; seul l'un est visible (display:none
// retire l'autre de l'arbre d'accessibilité et de l'ordre de tabulation).

export default function Matrix({ item, value, onChange, ids, ariaDescribedBy, invalid, readOnly, rt }) {
  const rows = rt.options;
  const cols = Array.isArray(item.columns) ? item.columns : [];
  const multiple = item.multiple === true || item.matrixType === 'multiple';
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const isOn = (r, c) => {
    const cell = v[String(r.value)];
    return Array.isArray(cell) ? cell.some(x => String(x) === String(c.value)) : cell !== undefined && cell !== null && String(cell) === String(c.value);
  };
  const set = (r, c, on) => {
    const rk = String(r.value);
    const next = { ...v };
    if (multiple) {
      const cur = Array.isArray(next[rk]) ? next[rk] : [];
      const list = on ? [...cur.filter(x => String(x) !== String(c.value)), c.value] : cur.filter(x => String(x) !== String(c.value));
      if (list.length) next[rk] = cols.map(x => x.value).filter(x => list.some(y => String(y) === String(x)));
      else delete next[rk];
    } else next[rk] = c.value;
    onChange(Object.keys(next).length ? next : null);
  };
  const input = (r, c, ri, prefix, first) => (
    <input
      type={multiple ? 'checkbox' : 'radio'}
      id={first ? `${ids.control}${prefix === 'w' ? '' : '-n'}` : undefined}
      name={`${ids.control}-${prefix}-${ri}`}
      checked={isOn(r, c)}
      disabled={readOnly}
      aria-invalid={invalid || undefined}
      onChange={e => set(r, c, multiple ? e.target.checked : true)}
    />
  );
  if (!rows.length || !cols.length) return <p className="fr-muted">Tableau incomplet.</p>;
  return (
    <div aria-describedby={ariaDescribedBy}>
      <div className="fr-matrix-wide">
        <table className="fr-matrix-table">
          <thead>
            <tr>
              <td />
              {cols.map(c => <th key={String(c.value)} scope="col">{c.label || String(c.value)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={String(r.value)} role={multiple ? 'group' : 'radiogroup'} aria-label={r.label || String(r.value)}>
                <th scope="row">{r.label || String(r.value)}</th>
                {cols.map((c, ci) => (
                  <td key={String(c.value)}>
                    <label className="fr-matrix-cell">
                      {input(r, c, ri, 'w', ri === 0 && ci === 0)}
                      <span className="sr-only">{`${r.label || r.value} : ${c.label || c.value}`}</span>
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fr-matrix-narrow">
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((r, ri) => (
            <fieldset key={String(r.value)} className="fr-field fr-card" style={{ padding: 12 }}>
              <legend className="fr-label" style={{ fontSize: '0.95rem' }}>{r.label || String(r.value)}</legend>
              <div className="fr-options" style={{ clear: 'both', paddingTop: 8 }}>
                {cols.map((c, ci) => (
                  <label key={String(c.value)} className="fr-option">
                    {input(r, c, ri, 'n', ri === 0 && ci === 0)}
                    <span>{c.label || String(c.value)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  );
}
