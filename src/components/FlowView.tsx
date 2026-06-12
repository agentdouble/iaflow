import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CategoryData,
  Flow,
  FlowRun,
  RunningMap,
} from '../../electron/shared/types';
import {
  UNCATEGORIZED,
  deleteCategoryData,
  getFlowsForCategory,
  getUncategorizedFlows,
  moveFlowInOrder,
  removeFlowFromOrder,
} from '../lib/categories';
import { generateId } from '../lib/id';
import { FlowCard } from './FlowCard';
import { CategoryGroup } from './CategoryGroup';
import { FlowModal, type FlowModalResult } from './FlowModal';
import { LogModal } from './LogModal';

const EMPTY_LIST_MESSAGE = 'Aucun flow. Créez-en un pour automatiser vos tâches.';

export function FlowView() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [catData, setCatData] = useState<CategoryData>({ categories: [], order: {} });
  const [runningMap, setRunningMap] = useState<RunningMap>({});
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const [editing, setEditing] = useState<{ flow: Flow | null; catId: string | null } | null>(
    null,
  );
  const [logModal, setLogModal] = useState<{ flow: Flow; run: FlowRun } | null>(null);

  const dragRef = useRef<{ flowId: string | null; catId: string | null }>({
    flowId: null,
    catId: null,
  });

  const refresh = useCallback(async () => {
    const [list, cats] = await Promise.all([
      window.api.flow.list(),
      window.api.flow.getCategories(),
    ]);
    setFlows(list);
    setCatData(cats);
    setLogModal((prev) => {
      if (!prev) return prev;
      const flow = list.find((f) => f.id === prev.flow.id);
      if (!flow) return prev;
      const run = flow.runs?.find((r) =>
        prev.run.logTimestamp
          ? r.logTimestamp === prev.run.logTimestamp
          : r.timestamp === prev.run.timestamp,
      );
      return run ? { flow, run } : prev;
    });
  }, []);

  useEffect(() => {
    void refresh();
    const refreshTimer = window.setInterval(() => {
      void refresh();
    }, 2000);

    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);

    void window.api.flow.getRunning().then((map) => {
      setRunningMap(map);
      setExpandedCards((prev) => {
        const next = new Set(prev);
        for (const id of Object.keys(map)) next.add(id);
        return next;
      });
    });

    const unsubStarted = window.api.flow.onRunStarted(({ flowId, ptyId }) => {
      setRunningMap((prev) => ({ ...prev, [flowId]: ptyId }));
      setExpandedCards((prev) => {
        const next = new Set(prev);
        next.add(flowId);
        return next;
      });
      void refresh();
    });

    const unsubComplete = window.api.flow.onRunComplete(({ flowId }) => {
      setRunningMap((prev) => {
        const next = { ...prev };
        delete next[flowId];
        return next;
      });
      void refresh();
    });

    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', onFocus);
      unsubStarted();
      unsubComplete();
    };
  }, [refresh]);

  const persistCats = useCallback(async (data: CategoryData) => {
    await window.api.flow.saveCategories(data);
  }, []);

  const handleAddCategory = async () => {
    const name = window.prompt('Nom de la catégorie');
    if (!name?.trim()) return;
    const cat = { id: generateId('cat'), name: name.trim() };
    const next: CategoryData = {
      categories: [...catData.categories, cat],
      order: { ...catData.order, [cat.id]: [] },
    };
    setCatData(next);
    await persistCats(next);
  };

  const handleRenameCategory = async (catId: string, newName: string) => {
    const next: CategoryData = {
      ...catData,
      categories: catData.categories.map((c) =>
        c.id === catId ? { ...c, name: newName } : c,
      ),
      order: { ...catData.order },
    };
    setCatData(next);
    await persistCats(next);
  };

  const handleDeleteCategory = async (catId: string) => {
    const copy: CategoryData = {
      categories: [...catData.categories],
      order: { ...catData.order },
    };
    if (!deleteCategoryData(copy, catId)) return;
    setCatData(copy);
    await persistCats(copy);
  };

  const handleToggleCollapse = (catId: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const handleToggleExpand = (flowId: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(flowId)) next.delete(flowId);
      else next.add(flowId);
      return next;
    });
  };

  const handleDrop = async (catId: string, insertIndex: number) => {
    const { flowId } = dragRef.current;
    if (!flowId) return;
    const order = { ...catData.order };
    moveFlowInOrder(order, flowId, catId, insertIndex);
    const next = { ...catData, order };
    setCatData(next);
    await persistCats(next);
    dragRef.current = { flowId: null, catId: null };
  };

  const handleSaveFlow = async ({ flow, categoryId }: FlowModalResult) => {
    await window.api.flow.save(flow);

    const order = { ...catData.order };
    if (categoryId) {
      moveFlowInOrder(order, flow.id, categoryId);
    } else if (!editing?.flow) {
      if (!order[UNCATEGORIZED]) order[UNCATEGORIZED] = [];
      const allOrdered = new Set(Object.values(order).flat());
      if (!allOrdered.has(flow.id)) order[UNCATEGORIZED].push(flow.id);
    }
    const next = { ...catData, order };
    setCatData(next);
    await persistCats(next);

    setEditing(null);
    void refresh();
  };

  const handleDeleteFlow = async (flowId: string) => {
    const order = { ...catData.order };
    removeFlowFromOrder(order, flowId);
    const next = { ...catData, order };
    setCatData(next);
    await persistCats(next);
    await window.api.flow.delete(flowId);
    void refresh();
  };

  const handleRun = async (flowId: string) => {
    await window.api.flow.runNow(flowId);
  };

  const handleToggle = async (flowId: string) => {
    await window.api.flow.toggle(flowId);
    void refresh();
  };

  const findFlowCategory = (flowId: string): string | null => {
    for (const [catId, ids] of Object.entries(catData.order)) {
      if (ids.includes(flowId)) return catId === UNCATEGORIZED ? null : catId;
    }
    return null;
  };

  const hasCats = catData.categories.length > 0;
  const uncatFlows = getUncategorizedFlows(flows, catData.order);

  return (
    <div className="flow-container">
      <div className="flow-header">
        <h2 className="flow-title">Flows</h2>
        <div className="flow-header-right" style={{ display: 'flex', gap: 8 }}>
          <button className="flow-add-btn" onClick={handleAddCategory}>
            + Catégorie
          </button>
          <button
            className="flow-add-btn"
            onClick={() => setEditing({ flow: null, catId: null })}
          >
            + Nouveau
          </button>
        </div>
      </div>

      <div className="flow-list">
        {flows.length === 0 && !hasCats && (
          <div className="flow-empty">{EMPTY_LIST_MESSAGE}</div>
        )}

        {catData.categories.map((cat) => (
          <CategoryGroup
            key={cat.id}
            catId={cat.id}
            catName={cat.name}
            flows={getFlowsForCategory(flows, catData.order, cat.id)}
            isUncategorized={false}
            isCollapsed={collapsedCats.has(cat.id)}
            runningMap={runningMap}
            expandedCards={expandedCards}
            onToggleCollapse={() => handleToggleCollapse(cat.id)}
            onRenameCategory={(name) => handleRenameCategory(cat.id, name)}
            onDeleteCategory={() => handleDeleteCategory(cat.id)}
            onToggleExpand={handleToggleExpand}
            onShowLog={(flow, run) => setLogModal({ flow, run })}
            onRun={handleRun}
            onToggle={handleToggle}
            onEdit={(flow) => setEditing({ flow, catId: findFlowCategory(flow.id) })}
            onDelete={handleDeleteFlow}
            onDragStart={(flowId, catId) => {
              dragRef.current = { flowId, catId };
            }}
            onDragEnd={() => {
              dragRef.current = { flowId: null, catId: null };
            }}
            onDrop={handleDrop}
          />
        ))}

        {hasCats && (uncatFlows.length > 0 || hasCats) && (
          <CategoryGroup
            catId={UNCATEGORIZED}
            catName="Sans catégorie"
            flows={uncatFlows}
            isUncategorized
            isCollapsed={collapsedCats.has(UNCATEGORIZED)}
            runningMap={runningMap}
            expandedCards={expandedCards}
            onToggleCollapse={() => handleToggleCollapse(UNCATEGORIZED)}
            onRenameCategory={() => {}}
            onDeleteCategory={() => {}}
            onToggleExpand={handleToggleExpand}
            onShowLog={(flow, run) => setLogModal({ flow, run })}
            onRun={handleRun}
            onToggle={handleToggle}
            onEdit={(flow) => setEditing({ flow, catId: findFlowCategory(flow.id) })}
            onDelete={handleDeleteFlow}
            onDragStart={(flowId, catId) => {
              dragRef.current = { flowId, catId };
            }}
            onDragEnd={() => {
              dragRef.current = { flowId: null, catId: null };
            }}
            onDrop={handleDrop}
          />
        )}

        {!hasCats &&
          uncatFlows.map((flow) => (
            <FlowCard
              key={flow.id}
              flow={flow}
              catId={UNCATEGORIZED}
              ptyId={runningMap[flow.id]}
              isExpanded={expandedCards.has(flow.id)}
              onToggleExpand={() => handleToggleExpand(flow.id)}
              onShowLog={(run) => setLogModal({ flow, run })}
              onRun={() => handleRun(flow.id)}
              onToggle={() => handleToggle(flow.id)}
              onEdit={() => setEditing({ flow, catId: null })}
              onDelete={() => handleDeleteFlow(flow.id)}
              onDragStart={() => {
                dragRef.current = { flowId: flow.id, catId: UNCATEGORIZED };
              }}
              onDragEnd={() => {
                dragRef.current = { flowId: null, catId: null };
              }}
            />
          ))}
      </div>

      {editing && (
        <FlowModal
          existing={editing.flow}
          existingCategoryId={editing.catId}
          categories={catData.categories}
          onSave={handleSaveFlow}
          onClose={() => setEditing(null)}
        />
      )}

      {logModal && (
        <LogModal
          flow={logModal.flow}
          run={logModal.run}
          onClose={() => setLogModal(null)}
        />
      )}
    </div>
  );
}
