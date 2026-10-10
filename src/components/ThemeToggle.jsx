import { Sun, Moon } from 'lucide-react';
import { useStore } from '../store';

export default function ThemeToggle() {
  const theme = useStore(s => s.theme);
  const toggleTheme = useStore(s => s.toggleTheme);
  const isDark = theme === 'dark';
  // Libellé fixe + aria-pressed (recommandation WAI-ARIA pour un interrupteur).
  const action = 'Thème sombre';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={action}
      aria-pressed={isDark}
      title={isDark ? 'Passer au thème clair' : 'Passer au thème sombre'}
      className="bg-elevated hover:bg-line border border-line text-ink p-2 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
    >
      {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
