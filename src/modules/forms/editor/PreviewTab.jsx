// Onglet « Aperçu » : rendu réel sur ordinateur / tablette / téléphone,
// avec réponses d'essai remplissables.
import { Suspense } from 'react';
import { Monitor, Tablet, Smartphone, RotateCcw } from 'lucide-react';
import { Segmented, SafeBoundary } from '../ui.jsx';
import { FormRenderer, resolveSources } from '../integrations.js';

const DEVICES = {
  desktop: { label: 'Ordinateur', width: 1024, icon: Monitor },
  tablet: { label: 'Tablette', width: 768, icon: Tablet },
  mobile: { label: 'Téléphone', width: 375, icon: Smartphone },
};

export function RendererMissing() {
  return (
    <div role="status" className="p-6 text-center text-sm text-dim border border-dashed border-line rounded-2xl">
      Le moteur d'affichage des formulaires n'est pas encore installé dans cette version : l'aperçu réel sera disponible dès son ajout.
      Le canevas de l'onglet « Construire » reste utilisable.
    </div>
  );
}

export default function PreviewTab({ def, device, setDevice, testAnswers, setTestAnswers, context, onItemClick, selectedId }) {
  const d = DEVICES[device] || DEVICES.desktop;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented label="Appareil" value={device} onChange={setDevice}
          options={Object.entries(DEVICES).map(([value, x]) => ({ value, label: x.label, icon: x.icon }))} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{d.width} px · {Object.keys(testAnswers).length} réponse(s) d'essai</span>
          <button type="button" className="btn-secondary !py-1.5" onClick={() => setTestAnswers({})}><RotateCcw size={14} aria-hidden="true" /> Réinitialiser l'essai</button>
        </div>
      </div>
      <div className="overflow-x-auto pb-2">
        <div
          data-device={device}
          className={`mx-auto bg-base border-line shadow-xl overflow-hidden ${device === 'mobile' ? 'border-[10px] rounded-[2.2rem]' : device === 'tablet' ? 'border-[12px] rounded-[1.6rem]' : 'border rounded-xl'}`}
          style={{ width: d.width + (device === 'mobile' ? 20 : device === 'tablet' ? 24 : 2), maxWidth: 'none' }}
        >
          {device === 'desktop' && (
            <div className="h-7 bg-elevated border-b border-line flex items-center gap-1.5 px-3" aria-hidden="true">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="ml-3 text-[10px] text-muted font-mono truncate">/#/f/{def.slug}</span>
            </div>
          )}
          <div className="overflow-y-auto" style={{ height: device === 'mobile' ? 720 : device === 'tablet' ? 900 : 760 }}>
            {FormRenderer ? (
              <SafeBoundary resetKey={`${def.updatedAt}-${device}`}>
                <Suspense fallback={<p className="p-6 text-sm text-dim">Chargement de l'aperçu…</p>}>
                  <FormRenderer definition={resolveSources(def, context)} answers={testAnswers} onAnswersChange={setTestAnswers} mode="preview" device={device}
                    highlightItemId={selectedId} onItemClick={onItemClick} context={context} />
                </Suspense>
              </SafeBoundary>
            ) : <div className="p-4"><RendererMissing /></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
