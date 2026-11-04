export interface VisibleRange {
  start: number;
  end: number;
  startRow: number;
  totalHeight: number;
}

/** Índices da grade que precisam existir no DOM (`end` exclusivo). */
export function visibleRange({
  scrollTop,
  viewportHeight,
  rowHeight,
  columns,
  total,
  overscanRows = 1,
}: {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  columns: number;
  total: number;
  overscanRows?: number;
}): VisibleRange {
  const rows = Math.ceil(total / columns);
  const firstRow = Math.floor(scrollTop / rowHeight);
  const lastRow = Math.ceil((scrollTop + viewportHeight) / rowHeight);
  const startRow = Math.min(Math.max(0, firstRow - overscanRows), rows);
  const endRow = Math.min(rows, lastRow + overscanRows);
  return {
    start: startRow * columns,
    end: Math.min(total, endRow * columns),
    startRow,
    totalHeight: rows * rowHeight,
  };
}

export interface VariableRange {
  start: number;
  end: number;
  paddingTop: number;
  paddingBottom: number;
  totalHeight: number;
}

/** Como `visibleRange`, para linhas de alturas diferentes (`end` exclusivo). */
export function variableRange({
  heights,
  scrollTop,
  viewportHeight,
  overscan = 4,
}: {
  heights: number[];
  scrollTop: number;
  viewportHeight: number;
  overscan?: number;
}): VariableRange {
  const total = heights.length;
  const tops: number[] = [];
  let offset = 0;
  let first = total;
  let last = total;
  for (let i = 0; i < total; i++) {
    tops.push(offset);
    const bottom = offset + heights[i];
    if (first === total && bottom > scrollTop) first = i;
    if (last === total && offset >= scrollTop + viewportHeight) last = i;
    offset = bottom;
  }
  // Rolagem além do fim (lista encolheu): mostra as últimas.
  if (first === total) first = Math.max(0, total - 1);
  const start = Math.max(0, first - overscan);
  const end = Math.min(total, last + overscan);
  const endOffset = end < total ? tops[end] : offset;
  return {
    start,
    end,
    paddingTop: total > 0 ? tops[start] : 0,
    paddingBottom: offset - endOffset,
    totalHeight: offset,
  };
}
