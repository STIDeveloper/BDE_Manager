import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import PwaUpdatePrompt from './components/pwa/PwaUpdatePrompt.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    {/* Bandeau de mise à jour / mode hors ligne du service worker */}
    <PwaUpdatePrompt />
  </React.StrictMode>
);
