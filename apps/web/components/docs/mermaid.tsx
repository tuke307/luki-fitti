'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Renders a ```mermaid code block on the client. The library is imported lazily,
 * so pages without diagrams never pay for it. On failure the source renders as a
 * plain code block — the information is still there.
 */

type MermaidModule = typeof import('mermaid');
let loader: Promise<MermaidModule> | null = null;

function loadMermaid(): Promise<MermaidModule> {
  loader ??= import('mermaid').then((mod) => {
    mod.default.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, 'Segoe UI', Roboto, sans-serif",
      themeVariables: {
        background: '#000000',
        primaryColor: '#1b1b1e',
        primaryBorderColor: '#2c2c31',
        primaryTextColor: '#f5f5f5',
        secondaryColor: '#141416',
        tertiaryColor: '#141416',
        lineColor: '#a2a2a8',
        textColor: '#f5f5f5',
        mainBkg: '#1b1b1e',
        nodeBorder: '#2c2c31',
        clusterBkg: '#141416',
        clusterBorder: '#2c2c31',
        edgeLabelBackground: '#000000',
        // Ember accent, reserved for the highlighted edge/element only.
        tertiaryBorderColor: '#d97c4a',
        tertiaryTextColor: '#d97c4a',
      },
    });
    return mod;
  });
  return loader;
}

let counter = 0;

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `docs-mermaid-${++counter}`;
    loadMermaid()
      .then((mod) => mod.default.render(id, chart))
      .then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (failed) {
    return (
      <pre>
        <code>{chart}</code>
      </pre>
    );
  }
  return <div ref={ref} className="docs-mermaid" aria-label="Diagram" />;
}
