import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface Props {
  ptyId?: string;
  initialContent?: string;
  scrollback?: number;
}

export function LiveTerminal({ ptyId, initialContent, scrollback = 3000 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      scrollback,
      cursorBlink: false,
      cursorStyle: 'bar',
      disableStdin: true,
      fontFamily:
        "'JetBrains Mono', 'SF Mono', Menlo, ui-monospace, monospace",
      fontSize: 12,
      theme: {
        background: '#1e1a16',
        foreground: '#ece6dc',
        cursor: '#ff3b6c',
        selectionBackground: 'rgba(255, 59, 108, 0.25)',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);

    let raf = requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {}
    });

    const resizeObs = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {}
    });
    resizeObs.observe(el);

    if (initialContent) term.write(initialContent);

    let unsub: (() => void) | undefined;
    if (ptyId) {
      unsub = window.api.pty.onData(ptyId, (data) => term.write(data));
    }

    return () => {
      cancelAnimationFrame(raf);
      unsub?.();
      resizeObs.disconnect();
      term.dispose();
    };
  }, [ptyId, initialContent, scrollback]);

  return <div ref={containerRef} className="iaflow-terminal-host" />;
}
