import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useStore } from '../store';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useStore();
  return (
    <button
      onClick={toggleTheme}
      className="bg-elevated hover:bg-line border border-line text-ink p-2 rounded-xl transition-colors"
      title={theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}