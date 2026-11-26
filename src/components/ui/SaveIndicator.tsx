/**
 * Estado do save automático. `reloaded`: a mochila mudou em outro lugar, foi
 * relida e o resto da ficha salvou sem ela (Fase 14). O indicador visual é
 * `SaveStatusPill` (`src/components/fx/SaveStatus.tsx`).
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'reloaded';
