import { describe, expect, it } from 'vitest';
import {
  applyMatrix,
  fromMatrix,
  invert,
  localFromWorld,
  multiply,
  snapAngle,
  toMatrix,
  worldFromLocal,
  type Point,
  type Transform,
} from './transform';

const base: Transform = {
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  flipX: false,
  flipY: false,
};

const samples: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: -3 },
  { x: -7, y: 22 },
];

/** Mesmo desenho = os pontos caem no mesmo lugar, seja qual for a decomposição. */
function expectSameDrawing(a: Transform, b: Transform) {
  for (const p of samples) {
    const pa = applyMatrix(toMatrix(a), p);
    const pb = applyMatrix(toMatrix(b), p);
    expect(pa.x).toBeCloseTo(pb.x, 6);
    expect(pa.y).toBeCloseTo(pb.y, 6);
  }
}

const parents: Transform[] = [
  { ...base, x: 100, y: 50 },
  { ...base, x: 100, y: 50, rotation: 1.1, scale: 2 },
  { ...base, x: -40, y: 8, rotation: -2.3, scale: 0.5, flipX: true },
  { ...base, x: 3, y: 90, rotation: 0.7, scale: 1.5, flipY: true },
  { ...base, x: 3, y: 90, rotation: 2.9, scale: 3, flipX: true, flipY: true },
];

const children: Transform[] = [
  { ...base, x: 20, y: -10 },
  { ...base, x: 20, y: -10, rotation: 0.4, scale: 0.8, flipX: true },
  { ...base, x: -5, y: 13, rotation: -1.9, scale: 1.2, flipY: true },
];

describe('matriz', () => {
  it('toMatrix ida e volta', () => {
    for (const t of [...parents, ...children]) {
      expectSameDrawing(t, fromMatrix(toMatrix(t), t.flipY));
    }
  });

  it('inversa desfaz a matriz', () => {
    const m = toMatrix(parents[2]);
    const p = applyMatrix(invert(m), applyMatrix(m, { x: 4, y: 9 }));
    expect(p.x).toBeCloseTo(4, 6);
    expect(p.y).toBeCloseTo(9, 6);
  });

  it('fromMatrix mantém o espelho vertical preferido', () => {
    const t = { ...base, rotation: 0.3, flipY: true };
    const back = fromMatrix(toMatrix(t), true);
    expect(back.flipY).toBe(true);
    expect(back.flipX).toBe(false);
    expect(back.rotation).toBeCloseTo(0.3, 6);
  });
});

describe('anexos: local ↔ mundo', () => {
  for (const [pi, parent] of parents.entries()) {
    for (const [ci, world] of children.entries()) {
      it(`anexar e desanexar não pula (pai ${pi}, filho ${ci})`, () => {
        const pm = toMatrix(parent);
        const local = localFromWorld(world, pm);
        expectSameDrawing(worldFromLocal(local, pm), world);
      });
    }
  }

  it('o filho acompanha quando o pai move, gira, escala e espelha', () => {
    const parent = { ...base, x: 10, y: 20 };
    const world = { ...base, x: 30, y: 20 };
    const local = localFromWorld(world, toMatrix(parent));

    const moved = worldFromLocal(local, toMatrix({ ...parent, x: 110 }));
    expect(moved.x).toBeCloseTo(130, 6);

    const turned = worldFromLocal(
      local,
      toMatrix({ ...parent, rotation: Math.PI / 2 })
    );
    expect(turned.x).toBeCloseTo(10, 6);
    expect(turned.y).toBeCloseTo(40, 6);
    expect(turned.rotation).toBeCloseTo(Math.PI / 2, 6);

    const bigger = worldFromLocal(local, toMatrix({ ...parent, scale: 2 }));
    expect(bigger.x).toBeCloseTo(50, 6);
    expect(bigger.scale).toBeCloseTo(2, 6);

    const flipped = worldFromLocal(local, toMatrix({ ...parent, flipX: true }));
    expect(flipped.x).toBeCloseTo(-10, 6);
    expect(flipped.flipX).toBe(true);
  });

  it('a composição bate com multiplicar as matrizes', () => {
    const local = children[1];
    const pm = toMatrix(parents[1]);
    const direct = multiply(pm, toMatrix(local));
    expectSameDrawing(worldFromLocal(local, pm), fromMatrix(direct, local.flipY));
  });
});

describe('snapAngle', () => {
  it('encaixa em 15°', () => {
    const step = Math.PI / 12;
    expect(snapAngle(0.3, step)).toBeCloseTo(step, 6);
    expect(snapAngle(-0.1, step)).toBeCloseTo(0, 6);
  });
});
