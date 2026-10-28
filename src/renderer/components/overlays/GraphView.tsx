import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Network, X } from 'lucide-react';
import clsx from 'clsx';
import { activePathOf, useStore } from '../../store/useStore';
import { IconButton } from '../ui/IconButton';
import { Toggle } from '../ui/Toggle';
import { Modal } from '../ui/Modal';

interface SimNode {
  path: string;
  title: string;
  linkCount: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface SimEdge {
  from: number;
  to: number;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

const MAX_NODES = 500;

export function GraphView() {
  const open = useStore((state) => state.ui.graphOpen);
  const local = useStore((state) => state.ui.graphLocal);
  const allNodes = useStore((state) => state.links.nodes);
  const allEdges = useStore((state) => state.links.edges);
  const activePath = useStore((state) => activePathOf(state));
  const setGraphOpen = useStore((state) => state.setGraphOpen);
  const setGraphLocal = useStore((state) => state.setGraphLocal);
  const openNote = useStore((state) => state.openNote);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const hoverRef = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    let visible = allNodes;
    if (local && activePath) {
      const keep = new Set<string>([activePath]);
      for (const edge of allEdges) {
        if (edge.from === activePath && edge.to) keep.add(edge.to);
        if (edge.to === activePath) keep.add(edge.from);
      }
      visible = allNodes.filter((node) => keep.has(node.path));
    }

    let truncated = false;
    if (visible.length > MAX_NODES) {
      truncated = true;
      visible = [...visible]
        .sort((a, b) => b.linkCount - a.linkCount || a.path.localeCompare(b.path))
        .slice(0, MAX_NODES);
    }

    const index = new Map<string, number>();
    const simNodes: SimNode[] = visible.map((node, order) => {
      index.set(node.path, order);
      const angle = (order * 2.399963) % (Math.PI * 2);
      const spread = 80 + Math.sqrt(order + 1) * 34;
      return {
        path: node.path,
        title: node.title,
        linkCount: node.linkCount,
        x: Math.cos(angle) * spread,
        y: Math.sin(angle) * spread,
        vx: 0,
        vy: 0,
        radius: 4 + Math.min(9, Math.sqrt(node.linkCount + 1) * 1.7),
      };
    });

    if (activePath) {
      const activeOrder = index.get(activePath);
      if (activeOrder !== undefined) {
        const node = simNodes[activeOrder];
        if (node) {
          node.x = 0;
          node.y = 0;
        }
      }
    }

    const simEdges: SimEdge[] = [];
    const seenEdges = new Set<string>();
    for (const edge of allEdges) {
      if (!edge.to) continue;
      const from = index.get(edge.from);
      const to = index.get(edge.to);
      if (from === undefined || to === undefined || from === to) continue;
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      simEdges.push({ from, to });
    }

    return { nodes: simNodes, edges: simEdges, truncated };
  }, [allNodes, allEdges, local, activePath]);

  const shownCount = nodes.length;

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || shownCount === 0) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let width = Math.max(1, stage.clientWidth);
    let height = Math.max(1, stage.clientHeight);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const view: View = { x: width / 2, y: height / 2, scale: 1 };
    let frame = 0;

    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--accent').trim() || '#7a5cb8';
    const textNormal = style.getPropertyValue('--text-normal').trim() || '#26272e';
    const textFaint = style.getPropertyValue('--text-faint').trim() || '#92949d';
    const border = style.getPropertyValue('--background-modifier-border-strong').trim() || '#cfcec5';
    const background = style.getPropertyValue('--background-primary').trim() || '#ffffff';

    // Deterministic force layout: repulsion, edge springs and a weak centring force.
    const count = nodes.length;
    const iterations = Math.min(220, Math.max(90, Math.round(120000 / Math.max(30, count))));
    for (let step = 0; step < iterations; step += 1) {
      const alpha = 1 - step / iterations;
      for (let a = 0; a < count; a += 1) {
        const first = nodes[a]!;
        for (let b = a + 1; b < count; b += 1) {
          const second = nodes[b]!;
          let dx = first.x - second.x;
          let dy = first.y - second.y;
          let distanceSq = dx * dx + dy * dy;
          if (distanceSq < 1) {
            dx = 0.5 + Math.random() * 0.5;
            dy = 0.5 + Math.random() * 0.5;
            distanceSq = dx * dx + dy * dy;
          }
          const distance = Math.sqrt(distanceSq);
          const force = (2600 / distanceSq) * alpha;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          first.vx += fx;
          first.vy += fy;
          second.vx -= fx;
          second.vy -= fy;
        }
      }
      for (const edge of edges) {
        const first = nodes[edge.from]!;
        const second = nodes[edge.to]!;
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (distance - 110) * 0.018;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        first.vx += fx;
        first.vy += fy;
        second.vx -= fx;
        second.vy -= fy;
      }
      for (const node of nodes) {
        node.vx -= node.x * 0.0025 * alpha;
        node.vy -= node.y * 0.0025 * alpha;
        node.vx = Math.max(-10, Math.min(10, node.vx * 0.84));
        node.vy = Math.max(-10, Math.min(10, node.vy * 0.84));
        node.x += node.vx;
        node.y += node.vy;
      }
    }

    const toWorld = (x: number, y: number): { x: number; y: number } => ({
      x: (x - view.x) / view.scale,
      y: (y - view.y) / view.scale,
    });

    const fit = (): void => {
      if (nodes.length === 0) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of nodes) {
        minX = Math.min(minX, node.x - node.radius);
        minY = Math.min(minY, node.y - node.radius);
        maxX = Math.max(maxX, node.x + node.radius);
        maxY = Math.max(maxY, node.y + node.radius);
      }
      const spanX = Math.max(40, maxX - minX);
      const spanY = Math.max(40, maxY - minY);
      view.scale = Math.max(
        0.18,
        Math.min(2, Math.min((width - 90) / spanX, (height - 90) / spanY)),
      );
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      view.x = width / 2 - centerX * view.scale;
      view.y = height / 2 - centerY * view.scale;
    };

    const draw = (): void => {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
      context.save();
      context.translate(view.x, view.y);
      context.scale(view.scale, view.scale);

      context.lineWidth = 1 / view.scale;
      context.strokeStyle = border;
      context.beginPath();
      for (const edge of edges) {
        const first = nodes[edge.from]!;
        const second = nodes[edge.to]!;
        context.moveTo(first.x, first.y);
        context.lineTo(second.x, second.y);
      }
      context.stroke();

      if (activePath) {
        context.strokeStyle = accent;
        context.globalAlpha = 0.75;
        context.beginPath();
        for (const edge of edges) {
          const first = nodes[edge.from]!;
          const second = nodes[edge.to]!;
          if (first.path !== activePath && second.path !== activePath) continue;
          context.moveTo(first.x, first.y);
          context.lineTo(second.x, second.y);
        }
        context.stroke();
        context.globalAlpha = 1;
      }

      for (const node of nodes) {
        const isActive = node.path === activePath;
        const isHovered = node.path === hoverRef.current;
        context.beginPath();
        context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        context.fillStyle = isActive ? accent : isHovered ? textNormal : textFaint;
        context.globalAlpha = isActive || isHovered ? 1 : 0.78;
        context.fill();
        context.globalAlpha = 1;
        context.lineWidth = 1.5 / view.scale;
        context.strokeStyle = background;
        context.stroke();
      }

      const showAllLabels = nodes.length <= 130 || view.scale > 1.05;
      const fontSize = 11 / view.scale;
      context.font = `${fontSize}px var(--font-ui, sans-serif)`;
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      for (const node of nodes) {
        if (!showAllLabels && node.path !== activePath && node.path !== hoverRef.current) continue;
        const label = node.title.length > 34 ? `${node.title.slice(0, 33)}…` : node.title;
        context.fillStyle =
          node.path === activePath || node.path === hoverRef.current ? textNormal : textFaint;
        context.fillText(label, node.x, node.y - node.radius - 3 / view.scale);
      }

      context.restore();
    };

    const nodeAt = (screenX: number, screenY: number): SimNode | null => {
      const world = toWorld(screenX, screenY);
      let best: SimNode | null = null;
      let bestDistance = Infinity;
      for (const node of nodes) {
        const dx = node.x - world.x;
        const dy = node.y - world.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const limit = node.radius + 6 / view.scale;
        if (distance <= limit && distance < bestDistance) {
          best = node;
          bestDistance = distance;
        }
      }
      return best;
    };

    const resize = (): void => {
      const rect = stage.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    const observer = new ResizeObserver(() => {
      const previousWidth = width;
      const previousHeight = height;
      resize();
      view.x += (width - previousWidth) / 2;
      view.y += (height - previousHeight) / 2;
      draw();
    });
    observer.observe(stage);

    resize();
    fit();
    draw();

    drawRef.current = draw;
    fitRef.current = () => {
      fit();
      draw();
    };

    let pointerDown = false;
    let moved = false;
    let start = { x: 0, y: 0, panX: 0, panY: 0 };
    let activePointer = -1;

    const position = (event: PointerEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      const point = position(event);
      pointerDown = true;
      moved = false;
      activePointer = event.pointerId;
      start = { x: point.x, y: point.y, panX: view.x, panY: view.y };
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // pointer capture is best-effort
      }
      setDragging(true);
    };

    const onPointerMove = (event: PointerEvent): void => {
      const point = position(event);
      if (pointerDown) {
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        view.x = start.panX + dx;
        view.y = start.panY + dy;
        draw();
        return;
      }
      const node = nodeAt(point.x, point.y);
      if ((node?.path ?? null) !== hoverRef.current) {
        hoverRef.current = node?.path ?? null;
        setHovered(node?.path ?? null);
        canvas.style.cursor = node ? 'pointer' : 'grab';
        draw();
      }
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (!pointerDown || event.pointerId !== activePointer) return;
      pointerDown = false;
      activePointer = -1;
      setDragging(false);
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      if (!moved) {
        const point = position(event);
        const node = nodeAt(point.x, point.y);
        if (node) {
          setGraphOpen(false);
          void openNote(node.path);
        }
      }
    };

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const point = position(event as unknown as PointerEvent);
      const world = toWorld(point.x, point.y);
      const factor = Math.exp(-event.deltaY * 0.0015);
      view.scale = Math.max(0.15, Math.min(3.5, view.scale * factor));
      view.x = point.x - world.x * view.scale;
      view.y = point.y - world.y * view.scale;
      draw();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      drawRef.current = null;
      fitRef.current = null;
      hoverRef.current = null;
    };
  }, [open, nodes, edges, activePath, shownCount, setGraphOpen, openNote]);

  if (!open) return null;

  return (
    <Modal
      bare
      className="graph-dialog"
      overlayClassName="graph-overlay"
      onClose={() => setGraphOpen(false)}
      ariaLabel="Graph view"
      closeLabel="Close graph"
    >
      <div className="graph-toolbar">
        <Network size={16} />
        <h2>Graph</h2>
        <span className="graph-meta">
          {shownCount} {shownCount === 1 ? 'note' : 'notes'} · {edges.length}{' '}
          {edges.length === 1 ? 'link' : 'links'}
          {local ? ' · local' : ''}
          {hovered ? ` · ${hovered}` : ''}
        </span>
        <span className="faint" style={{ fontSize: 'var(--font-tiny)' }}>
          Local
        </span>
        <Toggle checked={local} label="Local graph" onChange={(next) => setGraphLocal(next)} />
        <IconButton label="Fit graph to view" onClick={() => fitRef.current?.()}>
          <Maximize2 size={15} />
        </IconButton>
        <IconButton label="Close graph" onClick={() => setGraphOpen(false)}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="graph-stage" ref={stageRef}>
        {shownCount === 0 ? (
          <div className="graph-empty">
            No notes to plot yet. Create some notes and link them with [[wikilinks]].
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className={clsx('graph-canvas', dragging && 'is-panning')}
              aria-label="Force-directed link graph"
              role="img"
            />
            <div className="graph-hint">Drag to pan · scroll to zoom · click a note to open</div>
            <div className="graph-legend">
              <span>
                <span className="legend-dot" />
                Current note
              </span>
              <span>
                <span className="legend-dot is-muted" />
                Other notes
              </span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
