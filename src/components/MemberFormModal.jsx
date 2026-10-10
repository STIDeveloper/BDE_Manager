import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { useStore } from '../store';
import { Plus } from 'lucide-react';

export default function MemberFormModal({ isOpen, onClose, member, defaultColumnId }) {
  const { columns, availableBadges, availableRoles, addMember, updateMember, addBadge } = useStore();
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', mainRole: '', badges: [], columnId: '', notes: ''
  });
  const [newBadge, setNewBadge] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (member) setForm({ ...member, email: member.email || '', notes: member.notes || '' });
    else setForm({
      firstName: '', lastName: '', email: '', mainRole: '', badges: [],
      columnId: defaultColumnId || columns[0]?.id || '', notes: ''
    });
  }, [member, isOpen, defaultColumnId, columns]);

  const toggleBadge = (badge) => {
    setForm(f => ({
      ...f,
      badges: f.badges.includes(badge) ? f.badges.filter(b => b !== badge) : [...f.badges, badge]
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.firstName.trim()) return;
    if (member) updateMember(member.id, form);
    else addMember(form);
    onClose();
  };

  const handleAddCustomBadge = () => {
    const b = newBadge.trim();
    if (b && !form.badges.includes(b)) { addBadge(b); toggleBadge(b); setNewBadge(''); }
  };

  const inputCls = "w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-blue-500";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={member ? 'Modifier le membre' : 'Ajouter un membre'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-dim uppercase font-semibold mb-1 block">Prénom *</label>
            <input type="text" value={form.firstName}
              onChange={(e) => setForm({...form, firstName: e.target.value})}
              className={inputCls} placeholder="Aybal" required />
          </div>
          <div>
            <label className="text-xs text-dim uppercase font-semibold mb-1 block">Nom / Groupe</label>
            <input type="text" value={form.lastName}
              onChange={(e) => setForm({...form, lastName: e.target.value})}
              className={inputCls} placeholder="BDE QLIO" />
          </div>
        </div>

        <div>
          <label className="text-xs text-dim uppercase font-semibold mb-1 block">
            Email Google <span className="text-dim normal-case">(pour le partage Drive)</span>
          </label>
          <input type="email" value={form.email || ''}
            onChange={(e) => setForm({...form, email: e.target.value})}
            className={inputCls} placeholder="prenom.nom@gmail.com" />
        </div>

        <div>
          <label className="text-xs text-dim uppercase font-semibold mb-1 block">Rôle principal</label>
          <input type="text" list="roles-list" value={form.mainRole}
            onChange={(e) => setForm({...form, mainRole: e.target.value})}
            className={inputCls} placeholder="Respo TikTok" />
          <datalist id="roles-list">{availableRoles.map(r => <option key={r} value={r} />)}</datalist>
        </div>

        <div>
          <label className="text-xs text-dim uppercase font-semibold mb-1 block">Colonne / Pôle</label>
          <select value={form.columnId} onChange={(e) => setForm({...form, columnId: e.target.value})} className={inputCls}>
            {columns.map(col => <option key={col.id} value={col.id}>{col.title}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-dim uppercase font-semibold mb-1 block">Notes privées</label>
          <textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})}
            className={`${inputCls} min-h-[70px] text-sm`} placeholder="Infos diverses, contexte, historique..." />
        </div>

        <div>
          <label className="text-xs text-dim uppercase font-semibold mb-2 block">Badges</label>
          <div className="flex flex-wrap gap-2 mb-3 max-h-40 overflow-y-auto p-1">
            {availableBadges.map(badge => (
              <button type="button" key={badge} onClick={() => toggleBadge(badge)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors border ${
                  form.badges.includes(badge)
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-elevated border-line text-dim hover:border-dim'
                }`}>
                {badge}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newBadge} onChange={(e) => setNewBadge(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomBadge(); }}}
              placeholder="Créer un nouveau badge..."
              className="flex-1 bg-elevated border border-line rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-blue-500" />
            <button type="button" onClick={handleAddCustomBadge}
              className="bg-elevated hover:bg-line text-ink px-3 rounded-lg transition-colors border border-line">
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 bg-elevated hover:bg-line text-ink font-medium py-2.5 rounded-lg transition-colors border border-line">
            Annuler
          </button>
          <button type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg transition-colors">
            {member ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </form>
    </Modal>
  );
}