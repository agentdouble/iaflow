import type { CategoryData, Flow } from '../../electron/shared/types';

export const UNCATEGORIZED = '_uncategorized';

export function getFlowsForCategory(
  flows: Flow[],
  order: Record<string, string[]>,
  catId: string,
): Flow[] {
  const map = new Map(flows.map((f) => [f.id, f]));
  return (order[catId] || []).map((id) => map.get(id)).filter((f): f is Flow => !!f);
}

export function getUncategorizedFlows(
  flows: Flow[],
  order: Record<string, string[]>,
): Flow[] {
  const assigned = new Set(Object.values(order).flat());
  const map = new Map(flows.map((f) => [f.id, f]));
  const orderedIds = order[UNCATEGORIZED] || [];
  const inOrder = new Set(orderedIds);

  const out: Flow[] = orderedIds
    .map((id) => map.get(id))
    .filter((f): f is Flow => !!f);

  for (const f of flows) {
    if (!assigned.has(f.id) && !inOrder.has(f.id)) out.push(f);
  }
  return out;
}

export function removeFlowFromOrder(order: Record<string, string[]>, flowId: string): void {
  for (const key of Object.keys(order)) {
    order[key] = order[key].filter((id) => id !== flowId);
  }
}

export function moveFlowInOrder(
  order: Record<string, string[]>,
  flowId: string,
  targetCatId: string,
  insertIndex = -1,
): void {
  removeFlowFromOrder(order, flowId);
  if (!order[targetCatId]) order[targetCatId] = [];
  const arr = order[targetCatId];
  if (insertIndex >= 0 && insertIndex < arr.length) arr.splice(insertIndex, 0, flowId);
  else arr.push(flowId);
}

export function deleteCategoryData(data: CategoryData, catId: string): boolean {
  const cat = data.categories.find((c) => c.id === catId);
  if (!cat) return false;
  const flowIds = data.order[catId] || [];
  if (!data.order[UNCATEGORIZED]) data.order[UNCATEGORIZED] = [];
  data.order[UNCATEGORIZED].push(...flowIds);
  data.categories = data.categories.filter((c) => c.id !== catId);
  delete data.order[catId];
  return true;
}
