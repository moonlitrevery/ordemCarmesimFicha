/** Transformação de um objeto. Mesma ordem do Pixi: translação · rotação · escala. */
export interface Transform {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  flipX: boolean;
  flipY: boolean;
}

export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export interface Point {
  x: number;
  y: number;
}

export function toMatrix(t: Transform): Matrix {
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  const sx = t.scale * (t.flipX ? -1 : 1);
  const sy = t.scale * (t.flipY ? -1 : 1);
  return {
    a: cos * sx,
    b: sin * sx,
    c: -sin * sy,
    d: cos * sy,
    tx: t.x,
    ty: t.y,
  };
}

/** `parent · child`: leva coordenadas do filho para o espaço do pai. */
export function multiply(p: Matrix, m: Matrix): Matrix {
  return {
    a: p.a * m.a + p.c * m.b,
    b: p.b * m.a + p.d * m.b,
    c: p.a * m.c + p.c * m.d,
    d: p.b * m.c + p.d * m.d,
    tx: p.a * m.tx + p.c * m.ty + p.tx,
    ty: p.b * m.tx + p.d * m.ty + p.ty,
  };
}

export function invert(m: Matrix): Matrix {
  const det = m.a * m.d - m.b * m.c;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    tx: (m.c * m.ty - m.d * m.tx) / det,
    ty: (m.b * m.tx - m.a * m.ty) / det,
  };
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.tx, y: m.b * p.x + m.d * p.y + m.ty };
}

/**
 * Inverso de `toMatrix`. Giro de 180° + dois espelhos desenha o mesmo que nada:
 * `preferFlipY` escolhe entre as leituras, para o objeto manter o espelho que tinha.
 */
export function fromMatrix(m: Matrix, preferFlipY = false): Transform {
  const scale = Math.hypot(m.a, m.b);
  const reflected = m.a * m.d - m.b * m.c < 0;
  const flipY = preferFlipY;
  const flipX = reflected !== flipY;
  const fx = flipX ? -1 : 1;
  return {
    x: m.tx,
    y: m.ty,
    rotation: Math.atan2(m.b * fx, m.a * fx),
    scale,
    flipX,
    flipY,
  };
}

export function worldFromLocal(local: Transform, parentWorld: Matrix): Transform {
  return fromMatrix(multiply(parentWorld, toMatrix(local)), local.flipY);
}

export function localFromWorld(world: Transform, parentWorld: Matrix): Transform {
  return fromMatrix(multiply(invert(parentWorld), toMatrix(world)), world.flipY);
}

/** Rotação com Shift: encaixa nos passos dados. */
export function snapAngle(angle: number, step: number): number {
  return Math.round(angle / step) * step;
}
