// QR DE PRÉSENCE — retour sonore et vibration (sans fichier audio).
let ctx = null;

function audio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

function tone(freq, start, dur, gain = 0.15) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.02);
}

const vibrate = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* non pris en charge */ } };

/** kind : 'ok' | 'warn' | 'error' ; sound : false pour le mode silencieux. */
export function signal(kind, { sound = true } = {}) {
  if (kind === 'ok') {
    if (sound) { tone(880, 0, 0.12); tone(1320, 0.1, 0.14); }
    vibrate(80);
  } else if (kind === 'warn') {
    if (sound) { tone(520, 0, 0.12); tone(520, 0.18, 0.12); }
    vibrate([60, 60, 60]);
  } else {
    if (sound) tone(220, 0, 0.35, 0.2);
    vibrate([200, 80, 200]);
  }
}

/** À appeler lors d'un geste de l'utilisateur (ouverture du scanner) : débloque l'audio sur iOS. */
export const primeAudio = () => { audio(); };
