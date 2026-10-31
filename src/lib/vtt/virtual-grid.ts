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
