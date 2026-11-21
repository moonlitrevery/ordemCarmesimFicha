import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { paintAlpha, type CellRect, type FogMask } from '../fog/mask';

/** Jogador: preto total. Mestra: tom escuro a 50%, para ver o mapa por baixo. */
const PLAYER_TINT = 0x000000;
const GM_TINT = 0x0d0a0b;
const GM_ALPHA = 0.5;
/** Além da borda do mapa: o que está fora também fica coberto. */
const OUTSIDE = 100_000;

export interface FogLook {
  opaque: boolean;
  /** Fora do modo leve: média 3×3 na CPU, borda mais macia. */
  soft: boolean;
}

/**
 * A máscara vira uma textura pequena (uma célula = um pixel) esticada sobre o mapa;
 * o filtro linear da GPU faz a borda suave. Só o retângulo mudado é repintado, e
 * parada a névoa não pede quadro nenhum.
 */
export class FogLayer {
  readonly container = new Container();
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private texture: Texture | null = null;
  private sprite: Sprite | null = null;
  private frame = new Graphics();
  private frameKey = '';
  private size = { w: 0, h: 0 };
  private soft = true;

  constructor() {
    this.container.visible = false;
    this.container.addChild(this.frame);
  }

  /** `dirty` nulo com máscara nova ou tamanho novo repinta tudo. */
  sync(
    mask: FogMask | null,
    dirty: CellRect | null,
    map: { width: number; height: number },
    look: FogLook
  ) {
    if (!mask) {
      this.container.visible = false;
      this.dispose();
      return;
    }
    this.container.visible = true;

    let full = false;
    if (!this.canvas || this.size.w !== mask.w || this.size.h !== mask.h) {
      this.dispose();
      this.create(mask.w, mask.h);
      full = true;
    }
    if (look.soft !== this.soft) {
      this.soft = look.soft;
      full = true;
    }
    const rect = full ? { x: 0, y: 0, w: mask.w, h: mask.h } : dirty;
    if (rect) this.repaint(mask, rect);

    const tint = look.opaque ? PLAYER_TINT : GM_TINT;
    const alpha = look.opaque ? 1 : GM_ALPHA;
    if (this.sprite) {
      this.sprite.width = map.width;
      this.sprite.height = map.height;
      this.sprite.tint = tint;
      this.sprite.alpha = alpha;
    }
    this.drawFrame(map, tint, alpha);
  }

  destroy() {
    this.dispose();
    this.container.destroy({ children: true });
  }

  private create(w: number, h: number) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.size = { w, h };
    this.texture = Texture.from(canvas);
    this.texture.source.scaleMode = 'linear';
    this.sprite = new Sprite(this.texture);
    this.container.addChildAt(this.sprite, 0);
  }

  private repaint(mask: FogMask, dirty: CellRect) {
    if (!this.context || !this.texture) return;
    // A média 3×3 de uma célula depende das vizinhas: repinta uma a mais em volta.
    const pad = this.soft ? 1 : 0;
    const x = Math.max(0, dirty.x - pad);
    const y = Math.max(0, dirty.y - pad);
    const rect = {
      x,
      y,
      w: Math.min(mask.w, dirty.x + dirty.w + pad) - x,
      h: Math.min(mask.h, dirty.y + dirty.h + pad) - y,
    };
    if (rect.w <= 0 || rect.h <= 0) return;
    const image = this.context.createImageData(rect.w, rect.h);
    paintAlpha(mask, rect, image.data, this.soft);
    this.context.putImageData(image, rect.x, rect.y);
    // Sobe a textura inteira (no máximo 1024², ~4 MB, em geral 512×289): uma vez por quadro.
    this.texture.source.update();
  }

  private drawFrame(map: { width: number; height: number }, tint: number, alpha: number) {
    const key = `${map.width}:${map.height}`;
    if (key !== this.frameKey) {
      this.frameKey = key;
      const { width, height } = map;
      this.frame
        .clear()
        .rect(-OUTSIDE, -OUTSIDE, OUTSIDE * 2 + width, OUTSIDE)
        .rect(-OUTSIDE, height, OUTSIDE * 2 + width, OUTSIDE)
        .rect(-OUTSIDE, 0, OUTSIDE, height)
        .rect(width, 0, OUTSIDE, height)
        .fill(0xffffff);
    }
    this.frame.tint = tint;
    this.frame.alpha = alpha;
  }

  private dispose() {
    this.sprite?.destroy();
    this.sprite = null;
    this.texture?.destroy(true);
    this.texture = null;
    this.canvas = null;
    this.context = null;
    this.size = { w: 0, h: 0 };
  }
}
