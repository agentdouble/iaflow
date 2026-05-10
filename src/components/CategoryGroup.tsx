import { Fragment, useRef, useState } from 'react';
import type { Flow, FlowRun } from '../../electron/shared/types';
import { FlowCard } from './FlowCard';

interface Props {
  catId: string;
  catName: string;
  flows: Flow[];
  isUncategorized: boolean;
  isCollapsed: boolean;
  runningMap: Record<string, string>;
  expandedCards: Set<string>;
  onToggleCollapse: () => void;
  onRenameCategory: (newName: string) => void;
  onDeleteCategory: () => void;
  onToggleExpand: (flowId: string) => void;
  onShowLog: (flow: Flow, run: FlowRun) => void;
  onRun: (flowId: string) => void;
  onToggle: (flowId: string) => void;
  onEdit: (flow: Flow) => void;
  onDelete: (flowId: string) => void;
  onDragStart: (flowId: string, catId: string) => void;
  onDragEnd: () => void;
  onDrop: (catId: string, insertIndex: number) => void;
}

function computeInsertIndex(items: HTMLElement, clientY: number): number {
  const cards = [...items.querySelectorAll(':scope > .flow-card')] as HTMLElement[];
  if (cards.length === 0) return -1;
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (clientY < mid) return i;
  }
  return -1;
}

export function CategoryGroup(props: Props) {
  const itemsRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(props.catName);
  const [dropActive, setDropActive] = useState(false);
  const [dropIndex, setDropIndex] = useState<number>(-1);

  const groupClass = `flow-category-group${props.isCollapsed ? ' flow-category-collapsed' : ''}`;
  const itemsClass = `flow-category-items${dropActive ? ' flow-drop-zone-active' : ''}`;

  const handleHeaderClick = () => {
    if (renaming) return;
    props.onToggleCollapse();
  };

  const commitRename = () => {
    setRenaming(false);
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== props.catName) props.onRenameCategory(trimmed);
    else setRenameValue(props.catName);
  };

  return (
    <div className={groupClass} data-cat-id={props.catId}>
      <div className="flow-category-header" onClick={handleHeaderClick}>
        <span className="flow-category-chevron">▼</span>
        {renaming ? (
          <input
            className="flow-category-name-input"
            value={renameValue}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setRenameValue(props.catName);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <span className="flow-category-name">{props.catName}</span>
        )}
        <span className="flow-category-count">{props.flows.length}</span>

        {!props.isUncategorized && (
          <div className="flow-category-actions">
            <button
              className="flow-category-btn"
              title="Renommer"
              onClick={(e) => {
                e.stopPropagation();
                setRenameValue(props.catName);
                setRenaming(true);
              }}
            >
              ✎
            </button>
            <button
              className="flow-category-btn flow-category-btn-danger"
              title="Supprimer la catégorie"
              onClick={(e) => {
                e.stopPropagation();
                props.onDeleteCategory();
              }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div
        ref={itemsRef}
        className={itemsClass}
        data-cat-id={props.catId}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropActive(true);
          if (itemsRef.current) {
            setDropIndex(computeInsertIndex(itemsRef.current, e.clientY));
          }
        }}
        onDragLeave={(e) => {
          if (itemsRef.current && !itemsRef.current.contains(e.relatedTarget as Node)) {
            setDropActive(false);
            setDropIndex(-1);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDropActive(false);
          const insertAt = dropIndex;
          setDropIndex(-1);
          props.onDrop(props.catId, insertAt);
        }}
      >
        {!props.isCollapsed &&
          props.flows.map((flow, i) => (
            <Fragment key={flow.id}>
              {dropIndex === i && dropActive && (
                <div className="flow-drop-indicator flow-drop-active" />
              )}
              <FlowCard
                flow={flow}
                catId={props.catId}
                ptyId={props.runningMap[flow.id]}
                isExpanded={props.expandedCards.has(flow.id)}
                onToggleExpand={() => props.onToggleExpand(flow.id)}
                onShowLog={(run) => props.onShowLog(flow, run)}
                onRun={() => props.onRun(flow.id)}
                onToggle={() => props.onToggle(flow.id)}
                onEdit={() => props.onEdit(flow)}
                onDelete={() => props.onDelete(flow.id)}
                onDragStart={() => props.onDragStart(flow.id, props.catId)}
                onDragEnd={props.onDragEnd}
              />
            </Fragment>
          ))}
        {!props.isCollapsed && dropIndex === -1 && dropActive && props.flows.length > 0 && (
          <div className="flow-drop-indicator flow-drop-active" />
        )}
        {!props.isCollapsed && props.flows.length === 0 && (
          <div className="flow-empty" style={{ padding: '12px 0', fontSize: 12 }}>
            Glissez un flow ici
          </div>
        )}
      </div>
    </div>
  );
}
