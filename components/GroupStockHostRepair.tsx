import React, { useEffect } from 'react';

const normalize = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const GroupStockHostRepair: React.FC = () => {
  useEffect(() => {
    let host: HTMLElement | null = null;
    let stopped = false;

    const findPlateParent = () => {
      const label = Array.from(document.querySelectorAll('label')).find(el =>
        normalize(el.textContent).includes('placa do veiculo'),
      ) as HTMLElement | undefined;
      if (!label) return null;
      const grid = label.closest('.grid') as HTMLElement | null;
      const parent = grid?.parentElement || null;
      return grid && parent ? { grid, parent } : null;
    };

    const repair = () => {
      if (stopped) return;

      if (!host) {
        host = document.getElementById('motyq-group-stock-inline-host');
        if (!host) return;
      }

      if (host.isConnected) return;
      const target = findPlateParent();
      if (!target) return;
      target.parent.insertBefore(host, target.grid.nextSibling);
    };

    const interval = window.setInterval(repair, 180);
    const observer = new MutationObserver(() => repair());
    observer.observe(document.body, { childList: true, subtree: true });
    repair();

    return () => {
      stopped = true;
      window.clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  return null;
};

export default GroupStockHostRepair;
