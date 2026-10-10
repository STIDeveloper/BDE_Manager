import React, { useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { useStore } from '../store';
import { toast } from './ui/toastStore';

export default function BackupButtons() {
  const { exportAllData, importAllData } = useStore();
  const fileRef = useRef(null);

  const handleExport = () => {
    const payload = exportAllData();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BDE_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Backup téléchargé');
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const payload = JSON.parse(ev.target.result);
        if (!window.confirm(`⚠️ Importer ce backup va REMPLACER toutes les données actuelles.\n\nExporté le : ${payload.exportedAt || 'inconnu'}\n\nContinuer ?`)) return;
        importAllData(payload);
        toast.success('Import réussi !');
      } catch (err) {
        toast.error('Fichier invalide', err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <>
      <button
        onClick={handleExport}
        className="bg-elevated hover:bg-line border border-line text-ink p-2 rounded-xl transition-colors"
        title="Exporter toutes les données (JSON)"
      >
        <Download size={16} />
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        className="bg-elevated hover:bg-line border border-line text-ink p-2 rounded-xl transition-colors"
        title="Importer un backup JSON"
      >
        <Upload size={16} />
      </button>
      <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
    </>
  );
}
