import React, { useEffect, useRef, useState } from 'react';
import { Map, X } from 'lucide-react';
import { PERMISSION_LEVELS, FOLDER_COLORS, getRootFolder } from '../../store';

export default function MiniMap({ members, folders, drivePermissions, scrollContainerRef }) {
  const [visible, setVisible] = useState(false);
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 0, h: 0, totalW: 0, totalH: 0 });
  const mapRef = useRef(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateViewport = () => {
      setViewport({
        x: container.scrollLeft, y: container.scrollTop,
        w: container.clientWidth, h: container.clientHeight,
        totalW: container.scrollWidth, totalH: container.scrollHeight,
      });
    };

    updateViewport();
    container.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      container.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, [scrollContainerRef]);

  const needsMiniMap = viewport.totalW > viewport.w + 100 || viewport.totalH > viewport.h + 100;
  if (!needsMiniMap) return null;

  const MAP_W = 220;
  const MAP_H = 140;
  const scaleX = MAP_W / viewport.totalW;
  const scaleY = MAP_H / viewport.totalH;

  const handleClick = (e) => {
    const rect = mapRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const targetX = clickX / scaleX - viewport.w / 2;
    const targetY = clickY / scaleY - viewport.h / 2;
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({
        left: Math.max(0, targetX),
        top: Math.max(0, targetY),
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="absolute bottom-4 right-4 z-30">
      {!visible ? (
        <button onClick={() => setVisible(true)}
          className="bg-surface border border-line rounded-xl p-2.5 shadow-xl hover:border-dim transition-colors flex items-center gap-2 text-xs text-dim"
          title="Afficher la mini-map">
          <Map size={14} />
          <span>Navigation</span>
        </button>
      ) : (
        <div className="bg-surface border border-line rounded-xl shadow-xl p-2">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <span className="text-[9px] uppercase tracking-wider font-bold text-dim flex items-center gap-1">
              <Map size={10} /> Navigation
            </span>
            <button onClick={() => setVisible(false)} className="text-dim hover:text-ink p-0.5">
              <X size={10} />
            </button>
          </div>

          <div ref={mapRef} onClick={handleClick}
            className="relative bg-elevated rounded-lg cursor-pointer overflow-hidden border border-line"
            style={{ width: MAP_W, height: MAP_H }}>
            <div className="absolute inset-0 grid"
              style={{
                gridTemplateColumns: `repeat(${folders.length}, 1fr)`,
                gridTemplateRows: `repeat(${members.length}, 1fr)`,
                gap: '1px', padding: '2px',
              }}>
              {members.map((m, mi) =>
                folders.map((f, fi) => {
                  const lvl = (drivePermissions[m.id] || {})[f.id] || 'none';
                  const level = PERMISSION_LEVELS.find(l => l.id === lvl);
                  return (
                    <div key={`${mi}-${fi}`}
                      className={`rounded-sm ${lvl === 'none' ? 'bg-surface/40' : level.bg.replace('/20', '/60')}`}
                      style={{ minWidth: 2, minHeight: 2 }} />
                  );
                })
              )}
            </div>

            <div className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none rounded-sm"
              style={{
                left: viewport.x * scaleX + 2,
                top: viewport.y * scaleY + 2,
                width: viewport.w * scaleX,
                height: viewport.h * scaleY,
              }} />
          </div>

          <div className="text-[9px] text-dim mt-1.5 text-center">Clique pour naviguer</div>
        </div>
      )}
    </div>
  );
}