'use client';

import { motion } from 'framer-motion';
import { ELEMENT_LABELS } from '@/lib/constants';
import { getMosaicPieceColors, getTotalLevel } from '@/lib/calculations';
import type { CharacterElementRow } from '@/types/database';

const PIECES: string[] = [
  'M24 30 L78 30 L70 78 L24 70 Z',
  'M78 30 L130 30 L138 74 L70 78 Z',
  'M130 30 L176 30 L176 82 L138 74 Z',
  'M24 70 L70 78 L62 128 L24 120 Z',
  'M70 78 L138 74 L120 126 L62 128 Z',
  'M138 74 L176 82 L176 130 L120 126 Z',
  'M24 120 L62 128 L78 168 L24 172 Z',
  'M62 128 L120 126 L112 170 L78 168 Z',
  'M120 126 L176 130 L176 168 L148 174 L112 170 Z',
  'M24 172 L78 168 L70 210 L24 204 Z',
  'M78 168 L112 170 L128 208 L70 210 Z',
  'M112 170 L148 174 L176 168 L176 212 L128 208 Z',
  'M24 204 L70 210 L88 230 L24 230 Z',
  'M70 210 L128 208 L118 230 L88 230 Z',
  'M128 208 L176 212 L176 230 L118 230 Z',
  'M88 95 L115 92 L110 118 L85 120 Z',
  'M95 145 L125 142 L130 165 L98 168 Z',
  'M145 95 L168 100 L165 125 L140 118 Z',
  'M40 145 L58 142 L55 165 L38 160 Z',
  'M150 185 L170 180 L172 200 L148 202 Z',
];

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
    <section className="panel space-y-4 overflow-hidden p-4 md:p-6">
      <div className="text-center">
        <h2 className="section-title">O Mosaico de {characterName || '—'}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {Math.min(total, 20)} de 20 pedaços preenchidos
        </p>
      </div>

      <div className="mx-auto w-full max-w-sm overflow-hidden">
        <div className="overflow-hidden rounded-sm border-[12px] border-[#2a1c20] bg-[#120e10] shadow-[inset_0_0_0_3px_#5c303866,0_16px_40px_rgba(0,0,0,0.5)]">
          <div className="overflow-hidden border border-[#4a3038]/50 bg-[#0a0809] p-2">
            <svg viewBox="0 0 200 260" className="block h-auto w-full overflow-hidden" style={{ maxHeight: '420px' }}>
              <defs>
                <clipPath id="mosaicClip">
                  <rect x="24" y="30" width="152" height="200" rx="1" />
                </clipPath>
                <filter id="glassRipple" x="-5%" y="-5%" width="110%" height="110%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="7" result="noise" />
                  <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
                </filter>
                <linearGradient id="glassGloss" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
                  <stop offset="35%" stopColor="#ffffff" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.15" />
                </linearGradient>
                <pattern id="emptyGlass" width="8" height="8" patternUnits="userSpaceOnUse">
                  <rect width="8" height="8" fill="#1a1518" />
                  <path d="M0 8L8 0" stroke="#2a2228" strokeWidth="0.7" />
                </pattern>
              </defs>

              <rect x="24" y="30" width="152" height="200" fill="#141014" />

              <g clipPath="url(#mosaicClip)">
                {PIECES.map((d, i) => {
                  const fill = fills[i];
                  const filled = i < total && !!fill;
                  return (
                    <g key={i} filter={filled ? 'url(#glassRipple)' : undefined}>
                      <motion.path
                        d={d}
                        fill={filled ? fill!.color : 'url(#emptyGlass)'}
                        stroke="#0a0608"
                        strokeWidth="2.4"
                        strokeLinejoin="round"
                        initial={false}
                        animate={{ opacity: filled ? 1 : 0.55 }}
                        transition={{ duration: 0.5 }}
                      >
                        <title>
                          {filled
                            ? 'Nível ' + (i + 1) + ' — ' + ELEMENT_LABELS[fill!.element]
                            : 'Nível ' + (i + 1) + ' — vazio'}
                        </title>
                      </motion.path>
                      {filled && (
                        <path d={d} fill="url(#glassGloss)" stroke="none" style={{ pointerEvents: 'none' }} opacity={0.7} />
                      )}
                    </g>
                  );
                })}
              </g>

              <rect x="24" y="30" width="152" height="200" fill="none" stroke="#8B1E2D" strokeWidth="1" opacity="0.4" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
