import React, { useState, useMemo } from 'react';
import {
  Code2, Download, Copy, Check, AlertTriangle, Info, ExternalLink,
  FileText, Wand2,
} from 'lucide-react';
import Modal from '../Modal';
import { useStore } from '../../store';
import { generateAppsScript, generateInstructionsText } from '../../utils/driveScriptGenerator';

function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

export default function ShareScriptModal({ isOpen, onClose }) {
  const { members, folders, drivePermissions } = useStore();
  const [folderIds, setFolderIds] = useState({});
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('script');

  const { script, membersWithoutEmail, membersTable, foldersTable } = useMemo(() =>
    generateAppsScript({ members, folders, drivePermissions, folderIdsByCode: folderIds }),
    [members, folders, drivePermissions, folderIds]);

  const instructions = useMemo(() =>
    generateInstructionsText({ membersTable, foldersTable, membersWithoutEmail }),
    [membersTable, foldersTable, membersWithoutEmail]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeTab === 'script' ? script : instructions);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) { console.error(err); }
  };

  const handleDownload = () => {
    if (activeTab === 'script') downloadText(script, 'BDE_Drive_Sharing.gs');
    else downloadText(instructions, 'BDE_Drive_Instructions.txt');
  };

  const tabs = [
    { id: 'script',       label: 'Script Apps Script', icon: Code2 },
    { id: 'ids',          label: 'Configurer les IDs', icon: Wand2 },
    { id: 'instructions', label: 'Instructions TXT',   icon: FileText },
  ];

  const inputCls = "w-full bg-elevated border border-line rounded-lg px-2 py-1.5 text-ink font-mono text-xs focus:outline-none focus:border-blue-500";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Générer le script de partage Google Drive">
      <div className="space-y-4">
        {membersWithoutEmail.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="text-amber-500 font-semibold mb-1">
                  {membersWithoutEmail.length} membre{membersWithoutEmail.length > 1 ? 's' : ''} sans email
                </p>
                <p className="text-dim">Ces membres seront ignorés. Complète leurs emails dans la fiche membre.</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {membersWithoutEmail.map(m => (
                    <span key={m.id} className="text-[10px] bg-elevated border border-line rounded px-1.5 py-0.5 text-dim">
                      {m.firstName} {m.lastName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 flex items-start gap-2 text-xs text-dim">
          <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <div>
            Ce script utilise <strong className="text-ink">Google Apps Script</strong> pour appliquer les permissions.
            Remplis d'abord les IDs des dossiers, puis exécute via{' '}
            <a href="https://script.google.com" target="_blank" rel="noreferrer"
              className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
              script.google.com <ExternalLink size={10} />
            </a>.
          </div>
        </div>

        <div className="flex bg-elevated p-1 rounded-xl">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === t.id ? 'bg-surface text-ink shadow' : 'text-dim hover:text-ink'
                }`}>
                <Icon size={12} /> {t.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'ids' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-xs text-dim bg-purple-500/5 border border-purple-500/20 rounded-lg p-3">
              <Wand2 size={14} className="text-purple-500 shrink-0 mt-0.5" />
              <span>
                Colle l'<strong className="text-ink">ID de chaque dossier Google Drive</strong>.
                Ouvre le dossier dans Drive, l'ID est dans l'URL après <code className="bg-elevated px-1 rounded">/folders/</code>.
              </span>
            </div>
            <div className="bg-surface border border-line rounded-xl max-h-[45vh] overflow-y-auto p-3 space-y-2">
              {foldersTable.map(({ code, name, id }) => (
                <div key={code} className="flex items-center gap-2">
                  <div className="shrink-0 w-[140px]">
                    <div className="text-[10px] font-mono text-dim">{code}</div>
                    <div className="text-[10px] text-ink truncate" title={name}>{name}</div>
                  </div>
                  <input type="text" value={folderIds[code] || ''}
                    onChange={(e) => setFolderIds({ ...folderIds, [code]: e.target.value })}
                    placeholder={id.startsWith('TODO_ID_') ? 'ID Google Drive...' : id}
                    className={inputCls} />
                </div>
              ))}
            </div>
          </div>
        )}

        {(activeTab === 'script' || activeTab === 'instructions') && (
          <div className="bg-surface border border-line rounded-xl max-h-[50vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-elevated">
              <span className="text-[10px] uppercase tracking-wider text-dim font-bold">
                {activeTab === 'script' ? 'BDE_Drive_Sharing.gs' : 'BDE_Drive_Instructions.txt'}
              </span>
              <button onClick={handleCopy}
                className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg text-dim hover:text-ink hover:bg-line transition-colors">
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
            <pre className="text-[10px] font-mono text-ink/80 p-3 overflow-auto whitespace-pre flex-1">
              {activeTab === 'script' ? script : instructions}
            </pre>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-line">
          <button onClick={onClose}
            className="flex-1 bg-elevated hover:bg-line text-ink font-medium py-2.5 rounded-lg transition-colors border border-line text-sm">
            Fermer
          </button>
          {activeTab !== 'ids' && (
            <button onClick={handleDownload}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
              <Download size={14} /> Télécharger
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}