// A cena: um canvas de cor e três de altura (sólido, flutuante topo/base), todos em metros.
// Quem desenha um objeto escreve cor e altura; sombra, AO e relevo saem das alturas no fim.
import { createCanvas, Path2D, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import { polyBounds, type RectM, type Vec } from './geom';
import { Rng, ValueNoise } from './rng';
import type { FillOptions, TextureBank } from './textures';
import type { WallBox } from './buildings';

export type Ctx = SKRSContext2D;

/** Superfície onde dá para pôr coisa em cima (mesa, balcão), para a bagunça. */
export interface Surface {
  poly: Vec[];
  top: number;
  kind: 'table' | 'counter' | 'floor' | 'shelf';
}

export function polyPath(points: Vec[]): Path2D {
  const p = new Path2D();
  points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

export function circlePath(cx: number, cy: number, r: number): Path2D {
  const p = new Path2D();
  p.arc(cx, cy, r, 0, Math.PI * 2);
  p.closePath();
  return p;
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  p.closePath();
  return p;
}

export function rectPath(x: number, y: number, w: number, h: number, r = 0): Path2D {
  const p = new Path2D();
  if (r > 0) p.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  else p.rect(x, y, w, h);
  return p;
}

export class Scene {
  readonly W: number;
  readonly H: number;
  readonly color: Canvas;
  readonly c: Ctx;
  /** Altura de coluna cheia, do chão até o topo (parede, armário, carro). */
  readonly solid: Canvas;
  readonly s: Ctx;
  /** Objeto que flutua (copa, tampo de mesa, varal): topo e base. */
  readonly ftop: Canvas;
  readonly ft: Ctx;
  readonly fbot: Canvas;
  readonly fb: Ctx;
  /** Alturas analíticas de alta precisão (telhado, escada), em metros. */
  readonly hfield: Float32Array;
  /** Volumes flutuantes analíticos (copas): topo e base, em metros. */
  readonly floatTop: Float32Array;
  readonly floatBot: Float32Array;
  /** Terreno (tigela do vale), em metros, somado só no relevo. */
  terrain: Float32Array | null = null;
  /** Fator de sombra interna: dentro de casa a sombra é mais clara (luz rebatida). */
  readonly indoor: Canvas;
  readonly ind: Ctx;
  readonly surfaces: Surface[] = [];
  /** Paredes desenhadas: móvel que invade é empurrado para fora (ajuste fino). */
  readonly walls: WallBox[] = [];
  /** Trilhas: vegetação não nasce em cima. */
  readonly paths: { points: Vec[]; width: number }[] = [];
  /** Onde o detalhe de chão (tufos, flores) não nasce: muro, trilha, pedra. */
  readonly keepClear: ((p: Vec) => boolean)[] = [];
  /** Áreas ocupadas (pegadas de objetos), para espalhar vegetação/bagunça sem sobrepor. */
  readonly occupied: { poly: Vec[]; kind: string }[] = [];
  readonly warnings: string[] = [];
  readonly noise: ValueNoise;
  private stack = 0;

  constructor(
    readonly widthM: number,
    readonly heightM: number,
    readonly ppm: number,
    readonly hMax: number,
    readonly tex: TextureBank,
    readonly rng: Rng
  ) {
    this.W = Math.round(widthM * ppm);
    this.H = Math.round(heightM * ppm);
    const make = () => {
      const canvas = createCanvas(this.W, this.H);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(ppm, 0, 0, ppm, 0, 0);
      return [canvas, ctx] as const;
    };
    [this.color, this.c] = make();
    [this.solid, this.s] = make();
    [this.ftop, this.ft] = make();
    [this.fbot, this.fb] = make();
    [this.indoor, this.ind] = make();
    this.s.fillStyle = '#000';
    this.s.fillRect(0, 0, widthM, heightM);
    this.ft.fillStyle = '#000';
    this.ft.fillRect(0, 0, widthM, heightM);
    this.fb.fillStyle = '#fff';
    this.fb.fillRect(0, 0, widthM, heightM);
    this.ind.fillStyle = '#000';
    this.ind.fillRect(0, 0, widthM, heightM);
    this.s.globalCompositeOperation = 'lighten';
    this.ft.globalCompositeOperation = 'lighten';
    this.fb.globalCompositeOperation = 'darken';
    this.hfield = new Float32Array(this.W * this.H);
    this.floatTop = new Float32Array(this.W * this.H);
    this.floatBot = new Float32Array(this.W * this.H).fill(1e9);
    this.noise = new ValueNoise(rng.fork('scene-noise').int(1, 2 ** 30));
  }

  /** Tamanho de 1 px em metros. */
  get px(): number {
    return 1 / this.ppm;
  }

  private get all(): Ctx[] {
    return [this.c, this.s, this.ft, this.fb, this.ind];
  }

  /** Raio de `filter: blur()` num contexto em metros (o filtro segue a transformação). */
  blurM(meters: number): number {
    return Math.max(meters, 1 / this.ppm);
  }

  gray(h: number): string {
    const v = Math.max(0, Math.min(255, Math.round((h / this.hMax) * 255)));
    return `rgb(${v},${v},${v})`;
  }

  /** Entra num referencial local (posição, giro em graus): vale para cor e alturas. */
  push(x: number, y: number, rotDeg = 0, scale = 1) {
    for (const ctx of this.all) {
      ctx.save();
      ctx.translate(x, y);
      if (rotDeg) ctx.rotate((rotDeg * Math.PI) / 180);
      if (scale !== 1) ctx.scale(scale, scale);
    }
    this.stack++;
  }

  pop() {
    for (const ctx of this.all) ctx.restore();
    this.stack--;
  }

  frame(x: number, y: number, rotDeg: number, draw: () => void) {
    this.push(x, y, rotDeg);
    try {
      draw();
    } finally {
      this.pop();
    }
  }

  /** Projeta sombra: coluna cheia se `bottom` ≈ 0, senão um volume flutuante. */
  occlude(path: Path2D, top: number, bottom = 0) {
    if (bottom <= 0.05) {
      this.s.fillStyle = this.gray(top);
      this.s.fill(path);
    } else {
      this.ft.fillStyle = this.gray(top);
      this.ft.fill(path);
      this.fb.fillStyle = this.gray(bottom);
      this.fb.fill(path);
    }
  }

  /** Volume arredondado (copa, pedra, saco): o relevo e a sombra interna saem disso. */
  dome(cx: number, cy: number, r: number, top: number, edge: number, bottom = 0, path?: Path2D) {
    // Volume grande (copa, pedra) vai para o campo em float: no canvas de 8 bits a
    // encosta suave vira degraus, e o relevo desenha anéis.
    const m = this.c.getTransform();
    const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    if (r * scale >= 10) {
      this.domeField(m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f, r * scale, top, edge, bottom);
      return;
    }
    const ctx = bottom <= 0.05 ? this.s : this.ft;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const mid = edge + (top - edge) * 0.82;
    g.addColorStop(0, this.gray(top));
    g.addColorStop(0.55, this.gray(mid));
    g.addColorStop(1, this.gray(edge));
    ctx.fillStyle = g;
    const shape = path ?? circlePath(cx, cy, r);
    ctx.fill(shape);
    if (bottom > 0.05) {
      this.fb.fillStyle = this.gray(bottom);
      this.fb.fill(shape);
    }
  }

  /** Cúpula analítica em px de dispositivo: perfil (1 − t²)^0,6 entre topo e borda. */
  private domeField(px: number, py: number, rp: number, top: number, edge: number, bottom: number) {
    const x0 = Math.max(0, Math.floor(px - rp));
    const x1 = Math.min(this.W - 1, Math.ceil(px + rp));
    const y0 = Math.max(0, Math.floor(py - rp));
    const y1 = Math.min(this.H - 1, Math.ceil(py + rp));
    const inv = 1 / (rp * rp);
    const solid = bottom <= 0.05;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - py;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - px;
        const t2 = (dx * dx + dy * dy) * inv;
        if (t2 >= 1) continue;
        const h = edge + (top - edge) * Math.pow(1 - t2, 0.6);
        const i = y * this.W + x;
        if (solid) {
          if (h > this.hfield[i]) this.hfield[i] = h;
        } else {
          if (h > this.floatTop[i]) this.floatTop[i] = h;
          if (bottom < this.floatBot[i]) this.floatBot[i] = bottom;
        }
      }
    }
  }

  /** Zera as alturas numa área (piso novo por cima de tufos de grama, por exemplo). */
  clearHeights(path: Path2D, bounds?: RectM) {
    // Campos em float: rasteriza o caminho no retângulo e zera onde ele cobre.
    if (bounds) {
      const x0 = Math.max(0, Math.floor(bounds[0] * this.ppm));
      const y0 = Math.max(0, Math.floor(bounds[1] * this.ppm));
      const x1 = Math.min(this.W, Math.ceil(bounds[2] * this.ppm));
      const y1 = Math.min(this.H, Math.ceil(bounds[3] * this.ppm));
      if (x1 > x0 && y1 > y0) {
        const mask = createCanvas(x1 - x0, y1 - y0);
        const mg = mask.getContext('2d');
        mg.setTransform(this.ppm, 0, 0, this.ppm, -x0, -y0);
        mg.fillStyle = '#fff';
        mg.fill(path);
        const md = mg.getImageData(0, 0, x1 - x0, y1 - y0).data;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            if (md[((y - y0) * (x1 - x0) + (x - x0)) * 4 + 3] < 128) continue;
            const i = y * this.W + x;
            this.hfield[i] = 0;
            this.floatTop[i] = 0;
            this.floatBot[i] = 1e9;
          }
        }
      }
    }
    for (const [ctx, color] of [
      [this.s, '#000'],
      [this.ft, '#000'],
      [this.fb, '#fff'],
    ] as const) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
      ctx.fill(path);
      ctx.restore();
    }
  }

  /** Marca área coberta (interior): sombra ali fica mais suave. */
  markIndoor(path: Path2D) {
    this.ind.fillStyle = '#fff';
    this.ind.fill(path);
  }

  fill(path: Path2D, style: string | CanvasGradientLike, alpha = 1) {
    this.c.globalAlpha = alpha;
    this.c.fillStyle = style as string;
    this.c.fill(path);
    this.c.globalAlpha = 1;
  }

  stroke(path: Path2D, style: string, width: number, alpha = 1) {
    this.c.globalAlpha = alpha;
    this.c.strokeStyle = style;
    this.c.lineWidth = width;
    this.c.stroke(path);
    this.c.globalAlpha = 1;
  }

  /** Textura simples (objetos pequenos): segue o referencial atual. */
  pat(path: Path2D, material: string, opts: { rot?: number; ox?: number; oy?: number; brightness?: number; alpha?: number; scale?: number } = {}) {
    this.c.globalAlpha = opts.alpha ?? 1;
    this.c.fillStyle = this.tex.pattern(this.c, material, {
      rot: opts.rot,
      ox: opts.ox ?? this.rng.range(0, 3),
      oy: opts.oy ?? this.rng.range(0, 3),
      brightness: opts.brightness,
      scale: opts.scale,
    });
    this.c.fill(path);
    this.c.globalAlpha = 1;
  }

  /** Máscara de ruído suave (0..1) do tamanho de `bounds`, em px, com contraste. */
  noiseMask(bounds: RectM, cellM: number, seed: number, contrast = 2.2, bias = 0): Canvas {
    const [x0, y0, x1, y1] = bounds;
    const w = Math.max(2, Math.ceil((x1 - x0) / cellM) + 2);
    const h = Math.max(2, Math.ceil((y1 - y0) / cellM) + 2);
    const small = createCanvas(w, h);
    const g = small.getContext('2d');
    const img = g.createImageData(w, h);
    const n = new ValueNoise(seed);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const v = n.fbm((x0 / cellM + i) * 0.5, (y0 / cellM + j) * 0.5, 3);
        const a = Math.max(0, Math.min(1, (v - 0.5 + bias) * contrast + 0.5));
        const k = (j * w + i) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
        img.data[k + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return small;
  }

  /**
   * Preenche uma área grande com material, sem cara de azulejo: duas camadas do
   * mesmo ladrilho (uma girada) misturadas por ruído, a textura secundária do
   * material, e variação de tom de baixa frequência.
   */
  material(path: Path2D, bounds: RectM, material: string, opts: FillOptions = {}) {
    const grow = opts.feather ?? 0;
    const [bx0, by0, bx1, by1] = [bounds[0] - grow, bounds[1] - grow, bounds[2] + grow, bounds[3] + grow];
    const x0 = Math.max(0, bx0);
    const y0 = Math.max(0, by0);
    const x1 = Math.min(this.widthM, bx1);
    const y1 = Math.min(this.heightM, by1);
    if (x1 <= x0 || y1 <= y0) return;
    const pw = Math.ceil((x1 - x0) * this.ppm);
    const ph = Math.ceil((y1 - y0) * this.ppm);
    const layer = createCanvas(pw, ph);
    const g = layer.getContext('2d');
    g.setTransform(this.ppm, 0, 0, this.ppm, -x0 * this.ppm, -y0 * this.ppm);
    const rng = this.rng.fork(`mat:${material}:${x0}:${y0}`);
    const size = this.tex.sizeOf(material) * (opts.scale ?? 1);
    const rot = opts.rot ?? 0;
    // Material em grade (piso, tábua, paralelepípedo): a grade começa na borda e
    // as cópias anti-repetição só deslocam por ladrilhos inteiros, sem girar 90°.
    const grid = this.tex.isGrid(material);
    const origin: [number, number] = grid ? [bx0, by0] : [0, 0];
    const offset = () =>
      grid ? rng.int(0, 7) * size : rng.range(0, size * 4);
    const pat = (name: string, r: number, scale = opts.scale ?? 1, brightness = opts.brightness ?? 0) =>
      this.tex.pattern(g, name, { rot: r, ox: origin[0] + offset(), oy: origin[1] + offset(), scale, brightness });

    g.fillStyle = grid
      ? this.tex.pattern(g, material, { rot, ox: origin[0], oy: origin[1], scale: opts.scale, brightness: opts.brightness })
      : pat(material, rot);
    g.fillRect(x0, y0, x1 - x0, y1 - y0);

    const area = (x1 - x0) * (y1 - y0);
    const antiTile = opts.antiTile ?? area > size * size * 6;
    const blit = (draw: (lg: Ctx) => void, mask: Canvas, blend: string, alpha: number) => {
      const extra = createCanvas(pw, ph);
      const eg = extra.getContext('2d');
      eg.setTransform(this.ppm, 0, 0, this.ppm, -x0 * this.ppm, -y0 * this.ppm);
      draw(eg);
      eg.setTransform(1, 0, 0, 1, 0, 0);
      eg.globalCompositeOperation = 'destination-in';
      eg.drawImage(mask, 0, 0, pw, ph);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = blend as GlobalCompositeOperation;
      g.globalAlpha = alpha;
      g.drawImage(extra, 0, 0);
      g.restore();
    };
    if (antiTile) {
      // Segunda cópia girada 90° e deslocada, onde o ruído deixa.
      blit(
        (eg) => {
          eg.fillStyle = grid
            ? pat(material, rot + 180)
            : pat(material, rot + 90 * rng.int(1, 3), (opts.scale ?? 1) * rng.range(0.93, 1.08));
          eg.fillRect(x0, y0, x1 - x0, y1 - y0);
        },
        this.noiseMask([x0, y0, x1, y1], Math.max(size * 1.3, 0.8), rng.int(1, 2 ** 30), 2.6),
        'source-over',
        1
      );
    }
    const mix = this.tex.mixOf(material);
    if (mix) {
      blit(
        (eg) => {
          eg.fillStyle = pat(mix.texture, rng.range(0, 360), 1, opts.brightness ?? 0);
          eg.fillRect(x0, y0, x1 - x0, y1 - y0);
        },
        this.noiseMask([x0, y0, x1, y1], mix.scale_m / 4, rng.int(1, 2 ** 30), 2.4, mix.amount - 0.5),
        mix.blend ?? 'source-over',
        mix.blend === 'multiply' ? 0.7 : 0.95
      );
    }
    // Variação de tom grande: nada de chão uniforme.
    const tone = this.noiseMask([x0, y0, x1, y1], Math.max(1.2, size * 1.5), rng.int(1, 2 ** 30), 1.2);
    const toneLayer = createCanvas(pw, ph);
    const tg = toneLayer.getContext('2d');
    tg.fillStyle = '#000';
    tg.fillRect(0, 0, pw, ph);
    tg.drawImage(tone, 0, 0, pw, ph);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = 0.35;
    g.drawImage(toneLayer, 0, 0);
    g.restore();

    if (opts.feather) this.featherInto(layer, path, [x0, y0, x1, y1], opts.feather, rng.int(1, 2 ** 30));

    this.c.save();
    this.c.globalAlpha = opts.alpha ?? 1;
    if (!opts.feather) this.c.clip(path);
    this.c.drawImage(layer, x0, y0, x1 - x0, y1 - y0);
    this.c.restore();
  }

  /** Borda natural: o contorno vira transição esfiapada (terra no gramado, mato na mata). */
  private featherInto(layer: Canvas, path: Path2D, [x0, y0]: RectM, featherM: number, seed: number) {
    const pw = layer.width;
    const ph = layer.height;
    const mask = createCanvas(pw, ph);
    const mg = mask.getContext('2d');
    mg.setTransform(this.ppm, 0, 0, this.ppm, -x0 * this.ppm, -y0 * this.ppm);
    // O blur do filter é medido no espaço do usuário (aqui, metros).
    mg.filter = `blur(${Math.max(1 / this.ppm, featherM * 0.6)}px)`;
    mg.fillStyle = '#fff';
    mg.fill(path);
    mg.filter = 'none';
    const md = mg.getImageData(0, 0, pw, ph);
    const n = new ValueNoise(seed);
    const s = 1 / (featherM * 0.7);
    const fine = 1 / Math.max(0.05, featherM * 0.18);
    const ld = layer.getContext('2d');
    const img = ld.getImageData(0, 0, pw, ph);
    for (let j = 0; j < ph; j++) {
      const wy = y0 + j / this.ppm;
      for (let i = 0; i < pw; i++) {
        const k = (j * pw + i) * 4;
        const m = md.data[k + 3] / 255;
        if (m >= 0.999) continue;
        if (m <= 0.001) {
          img.data[k + 3] = 0;
          continue;
        }
        const wx = x0 + i / this.ppm;
        const v = n.at(wx * s, wy * s) * 0.6 + n.at(wx * fine + 31, wy * fine) * 0.4;
        const a = Math.max(0, Math.min(1, (m - 0.5) * 4 + (v - 0.5) * 2.2 + 0.5));
        img.data[k + 3] *= a;
      }
    }
    ld.save();
    ld.setTransform(1, 0, 0, 1, 0, 0);
    ld.putImageData(img, 0, 0);
    ld.restore();
  }

  materialPoly(points: Vec[], material: string, opts: FillOptions = {}) {
    this.material(polyPath(points), polyBounds(points), material, opts);
  }

  /** Mancha irregular (sujeira, limo, umidade): alfa por ruído, bordas suaves. */
  stain(bounds: RectM, color: string, alpha: number, cellM: number, opts: { blend?: string; contrast?: number; bias?: number; clip?: Path2D } = {}) {
    const [x0, y0, x1, y1] = bounds;
    const mask = this.noiseMask(bounds, cellM, this.rng.int(1, 2 ** 30), opts.contrast ?? 2.5, opts.bias ?? -0.15);
    const pw = Math.max(1, Math.ceil((x1 - x0) * this.ppm));
    const ph = Math.max(1, Math.ceil((y1 - y0) * this.ppm));
    const layer = createCanvas(pw, ph);
    const g = layer.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, pw, ph);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(mask, 0, 0, pw, ph);
    this.c.save();
    if (opts.clip) this.c.clip(opts.clip);
    this.c.globalAlpha = alpha;
    this.c.globalCompositeOperation = (opts.blend ?? 'source-over') as GlobalCompositeOperation;
    this.c.drawImage(layer, x0, y0, x1 - x0, y1 - y0);
    this.c.restore();
  }

  warn(message: string) {
    this.warnings.push(message);
  }
}

// O tipo de gradiente do @napi-rs/canvas não é exportado com nome estável.
export type CanvasGradientLike = ReturnType<Ctx['createLinearGradient']>;
