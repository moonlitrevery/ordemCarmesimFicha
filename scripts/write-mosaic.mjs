import fs from 'fs';

/** 20 irregular mosaic shards inside a portrait frame (viewBox 0 0 200 260) */
const PIECES = [
  'M 28 36 L 72 32 L 68 70 L 30 78 Z',
  'M 72 32 L 118 28 L 112 66 L 68 70 Z',
  'M 118 28 L 172 34 L 166 72 L 112 66 Z',
  'M 30 78 L 68 70 L 74 112 L 28 118 Z',
  'M 68 70 L 112 66 L 108 108 L 74 112 Z',
  'M 112 66 L 166 72 L 158 114 L 108 108 Z',
  'M 28 118 L 74 112 L 70 148 L 34 156 Z',
  'M 74 112 L 108 108 L 118 150 L 70 148 Z',
  'M 108 108 L 158 114 L 152 152 L 118 150 Z',
  'M 158 114 L 166 72 L 172 120 L 152 152 Z',
  'M 34 156 L 70 148 L 78 188 L 32 192 Z',
  'M 70 148 L 118 150 L 112 190 L 78 188 Z',
  'M 118 150 L 152 152 L 148 194 L 112 190 Z',
  'M 152 152 L 172 120 L 174 168 L 148 194 Z',
  'M 32 192 L 78 188 L 72 228 L 36 224 Z',
  'M 78 188 L 112 190 L 124 226 L 72 228 Z',
  'M 112 190 L 148 194 L 142 230 L 124 226 Z',
  'M 148 194 L 174 168 L 170 220 L 142 230 Z',
  'M 36 224 L 72 228 L 90 248 L 40 246 Z',
  'M 72 228 L 124 226 L 142 230 L 160 248 L 90 248 Z',
];

fs.writeFileSync(
  'src/components/mosaic/MosaicFrame.tsx',
  `'use client';

import { motion } from 'framer-motion';
import { ELEMENT_LABELS } from '@/lib/constants';
import { getMosaicPieceColors, getTotalLevel } from '@/lib/calculations';
import type { CharacterElementRow } from '@/types/database';

const PIECES = ${JSON.stringify(PIECES, null, 2)};

export function MosaicFrame({
  characterName,
  elements,
}: {
  characterName: string;
  elements: CharacterElementRow[];
}) {
  const total = getTotalLevel(elements);
  const fills = getMosaicPieceColors(elements);

  return (
    <section className="panel space-y-4 p-4 md:p-6">
      <div className="text-center">
        <h2 className="section-title">O Mosaico de {characterName || '—'}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {total} de 20 fragmentos do quadro preenchidos
        </p>
      </div>

      <div className="mx-auto w-full max-w-sm">
        <div className="rounded-sm border-[10px] border-[#3a2a2e] bg-[#1a1418] p-2 shadow-[inset_0_0_0_2px_#8B1E2D55,0_20px_50px_rgba(0,0,0,0.45)]">
          <div className="border border-[#5c4048]/60 bg-[#0e0b0e] p-1">
            <svg viewBox="0 0 200 260" className="h-auto w-full">
              <defs>
                <filter id="glass" x="-20%" y="-20%" width="140%" height="140%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="noise" />
                  <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" />
                </filter>
                <linearGradient id="glassShine" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
                  <stop offset="45%" stopColor="#fff" stopOpacity="0" />
                  <stop offset="100%" stopColor="#fff" stopOpacity="0.12" />
                </linearGradient>
                <pattern id="emptyTile" width="6" height="6" patternUnits="userSpaceOnUse">
                  <path d="M0 6L6 0" stroke="#2a2228" strokeWidth="0.6" />
                </pattern>
              </defs>

              <rect x="18" y="22" width="164" height="216" fill="#121014" stroke="#2A2228" strokeWidth="1" />

              {PIECES.map((d, i) => {
                const fill = fills[i];
                const filled = i < total && fill;
                return (
                  <g key={i}>
                    <motion.path
                      d={d}
                      fill={filled ? fill!.color : 'url(#emptyTile)'}
                      stroke="#0C0A0D"
                      strokeWidth="1.4"
                      initial={false}
                      animate={{
                        opacity: filled ? 1 : 0.45,
                        filter: filled ? 'url(#glass)' : undefined,
                      }}
                      transition={{ duration: 0.55, delay: filled ? 0.02 * i : 0 }}
                    >
                      <title>
                        {filled
                          ? 'Nível ' + (i + 1) + ' — ' + ELEMENT_LABELS[fill!.element]
                          : 'Nível ' + (i + 1) + ' — vazio'}
                      </title>
                    </motion.path>
                    {filled && (
                      <path d={d} fill="url(#glassShine)" opacity="0.55" style={{ pointerEvents: 'none' }} />
                    )}
                  </g>
                );
              })}

              {/* moldura interna em L */}
              <rect x="18" y="22" width="164" height="216" fill="none" stroke="#8B1E2D" strokeWidth="1.2" opacity="0.35" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
`
);

console.log('MosaicFrame written');
