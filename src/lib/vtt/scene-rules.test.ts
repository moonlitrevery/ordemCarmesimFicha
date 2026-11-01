import { describe, expect, it } from 'vitest';
import {
  allowPerKey,
  attachPatch,
  backZ,
  canDeleteObject,
  defaultObjectScale,
  descendantsOf,
  detachPatch,
  DEFAULT_CAPTION,
  effectiveParent,
  frontZ,
  isSceneLive,
  isValidDrawing,
  isValidObject,
  membersInScene,
  patchFromWorld,
  resolveViewedScene,
  sanitizeCaption,
  scrambleText,
  userColor,
  worldTransform,
  wouldCreateCycle,
} from './scene-rules';
import type { SceneObject, VttMember } from './types';

function object(id: string, patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id,
    scene_id: 's1',
    asset_id: 'a1',
    kind: 'token',
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    flip_x: false,
    flip_y: false,
    z: 0,
    parent_id: null,
    local: null,
    caption: null,
    conditions: [],
    character_id: null,
    npc_id: null,
    hidden: false,
    created_by: 'u1',
    updated_at: '2026-01-01T00:00:00Z',
    ...patch,
  };
}

function member(userId: string, patch: Partial<VttMember> = {}): VttMember {
  return {
    userId,
    name: userId,
    role: 'jogador',
    sceneId: null,
    banned: false,
    joinedAt: '',
    ...patch,
  };
}

const viewInput = {
  sessionOpen: true,
  memberSceneId: null,
  defaultSceneId: 'def',
  gmChoice: null,
  sceneIds: ['def', 'other'],
};

describe('resolveViewedScene', () => {
  it('mestra vê a que escolheu, mesmo com sessão fechada', () => {
    expect(
      resolveViewedScene({
        ...viewInput,
        role: 'mestre',
        gmChoice: 'other',
        sessionOpen: false,
      })
    ).toBe('other');
  });

  it('mestra cai na padrão e depois na primeira', () => {
    expect(resolveViewedScene({ ...viewInput, role: 'mestre' })).toBe('def');
    expect(
      resolveViewedScene({ ...viewInput, role: 'mestre', defaultSceneId: null })
    ).toBe('def');
    expect(
      resolveViewedScene({ ...viewInput, role: 'mestre', gmChoice: 'apagada' })
    ).toBe('def');
  });

  it('jogador separado fica na cena dele', () => {
    expect(
      resolveViewedScene({ ...viewInput, role: 'jogador', memberSceneId: 'other' })
    ).toBe('other');
    expect(resolveViewedScene({ ...viewInput, role: 'jogador' })).toBe('def');
  });

  it('espectador fica na padrão', () => {
    expect(
      resolveViewedScene({
        ...viewInput,
        role: 'espectador',
        memberSceneId: 'other',
      })
    ).toBe('def');
  });

  it('sessão fechada esconde de quem não é mestra', () => {
    expect(
      resolveViewedScene({ ...viewInput, role: 'jogador', sessionOpen: false })
    ).toBeNull();
  });
});

describe('membersInScene', () => {
  const members = [
    member('a'),
    member('b', { sceneId: 'other' }),
    member('c', { role: 'espectador', sceneId: 'other' }),
    member('d', { banned: true }),
  ];

  it('conta quem está com o grupo e quem foi separado', () => {
    expect(membersInScene('def', members, 'def').map((m) => m.userId)).toEqual([
      'a',
      'c',
    ]);
    expect(membersInScene('other', members, 'def').map((m) => m.userId)).toEqual([
      'b',
    ]);
  });

  it('cena sem ninguém ou sessão fechada não está no ar', () => {
    expect(isSceneLive('secreta', members, 'def', true)).toBe(false);
    expect(isSceneLive('def', members, 'def', false)).toBe(false);
    expect(isSceneLive('def', members, 'def', true)).toBe(true);
  });
});

describe('anexos', () => {
  it('impede ciclo direto, indireto e em si mesmo', () => {
    const objects = {
      a: object('a'),
      b: object('b', { parent_id: 'a' }),
      c: object('c', { parent_id: 'b' }),
    };
    expect(wouldCreateCycle('a', 'c', objects)).toBe(true);
    expect(wouldCreateCycle('a', 'a', objects)).toBe(true);
    expect(wouldCreateCycle('c', 'a', objects)).toBe(false);
  });

  it('ciclo forjado não trava: vira objeto solto', () => {
    const local = { x: 0, y: 0, rotation: 0, scale: 1, flipX: false, flipY: false };
    const objects = {
      a: object('a', { parent_id: 'b', local }),
      b: object('b', { parent_id: 'a', local }),
    };
    expect(effectiveParent(objects.a, objects)).toBeNull();
    expect(worldTransform(objects.a, objects).x).toBe(0);
  });

  it('pai fora da cena (oculto para o jogador) deixa o filho solto', () => {
    const local = { x: 9, y: 9, rotation: 0, scale: 1, flipX: false, flipY: false };
    const objects = { a: object('a', { x: 5, parent_id: 'sumiu', local }) };
    expect(worldTransform(objects.a, objects).x).toBe(5);
  });

  it('anexar e desanexar mantém o objeto no lugar, com pai girado e espelhado', () => {
    const objects: Record<string, SceneObject> = {
      pai: object('pai', {
        x: 100,
        y: 50,
        rotation: 0.9,
        scale: 2,
        flip_x: true,
      }),
      arma: object('arma', { x: 130, y: 70, rotation: 0.2, scale: 0.5 }),
    };
    const attached = {
      ...objects,
      arma: { ...objects.arma, ...attachPatch(objects.arma, objects.pai, objects) },
    };
    const during = worldTransform(attached.arma, attached);
    expect(during.x).toBeCloseTo(130, 6);
    expect(during.y).toBeCloseTo(70, 6);

    const detached = detachPatch(attached.arma, attached);
    expect(detached.parent_id).toBeNull();
    expect(detached.local).toBeNull();
    expect(detached.x).toBeCloseTo(130, 6);
    expect(detached.y).toBeCloseTo(70, 6);
    expect(detached.rotation).toBeCloseTo(0.2, 6);
    expect(detached.scale).toBeCloseTo(0.5, 6);
  });

  it('o filho acompanha o pai, em cadeia', () => {
    const base: Record<string, SceneObject> = {
      a: object('a', { x: 10 }),
      b: object('b', { x: 20 }),
      c: object('c', { x: 30 }),
    };
    let objects: Record<string, SceneObject> = {
      ...base,
      b: { ...base.b, ...attachPatch(base.b, base.a, base) },
    };
    objects = {
      ...objects,
      c: { ...objects.c, ...attachPatch(objects.c, objects.b, objects) },
    };
    objects.a = { ...objects.a, x: 110 };
    expect(worldTransform(objects.c, objects).x).toBeCloseTo(130, 6);
  });

  it('arrastar um anexado grava relativo ao pai', () => {
    const local = { x: 5, y: 0, rotation: 0, scale: 1, flipX: false, flipY: false };
    const objects = {
      p: object('p', { x: 100, scale: 2 }),
      c: object('c', { parent_id: 'p', local }),
    };
    const patch = patchFromWorld(objects.c, objects, {
      ...worldTransform(objects.c, objects),
      x: 120,
    });
    expect(patch.x).toBeUndefined();
    expect(patch.local?.x).toBeCloseTo(10, 6);
  });

  it('lista descendentes sem repetir', () => {
    const objects = {
      a: object('a'),
      b: object('b', { parent_id: 'a' }),
      c: object('c', { parent_id: 'b' }),
      d: object('d'),
    };
    expect(descendantsOf('a', objects).map((o) => o.id)).toEqual(['b', 'c']);
  });
});

describe('ordem', () => {
  it('frente e trás consideram só os irmãos', () => {
    const objects = {
      a: object('a', { z: 1 }),
      b: object('b', { z: 5 }),
      c: object('c', { z: 100, parent_id: 'a' }),
    };
    expect(frontZ(objects.a, objects)).toBe(6);
    expect(backZ(objects.b, objects)).toBe(0);
    expect(frontZ(objects.c, objects)).toBe(101);
  });
});

describe('permissões', () => {
  it('apagar: mestra tudo, jogador o próprio, espectador nada', () => {
    const own = { created_by: 'u1' };
    expect(canDeleteObject(own, 'mestre', 'x')).toBe(true);
    expect(canDeleteObject(own, 'jogador', 'u1')).toBe(true);
    expect(canDeleteObject(own, 'jogador', 'u2')).toBe(false);
    expect(canDeleteObject(own, 'espectador', 'u1')).toBe(false);
  });
});

describe('legenda', () => {
  it('ofuscar mantém comprimento e espaços, e troca o texto', () => {
    const scrambled = scrambleText('Olá mundo', () => 0);
    expect(Array.from(scrambled)).toHaveLength(9);
    expect(scrambled[3]).toBe(' ');
    expect(scrambled).toBe('AAA AAAAA');
  });

  it('legenda vazia some; cor inválida volta ao padrão', () => {
    expect(sanitizeCaption({ ...DEFAULT_CAPTION, text: '   ' })).toBeNull();
    const clean = sanitizeCaption({
      ...DEFAULT_CAPTION,
      text: ' oi ',
      color: 'red;',
      strokeWidth: 99,
    });
    expect(clean?.text).toBe('oi');
    expect(clean?.color).toBe(DEFAULT_CAPTION.color);
    expect(clean?.strokeWidth).toBe(8);
  });
});

describe('tamanho inicial', () => {
  it('não depende da resolução do arquivo', () => {
    const small = defaultObjectScale('token', { width: 256, height: 256 }, 4000);
    const big = defaultObjectScale('token', { width: 512, height: 512 }, 4000);
    expect(small * 256).toBeCloseTo(200);
    expect(big * 512).toBeCloseTo(200);
    expect(
      defaultObjectScale('adereco', { width: 1000, height: 500 }, 4000) * 1000
    ).toBeCloseTo(500);
  });
});

describe('cor e limites', () => {
  it('cor é estável', () => {
    expect(userColor('abc')).toBe(userColor('abc'));
  });

  it('um ping por segundo por pessoa', () => {
    const last = new Map<string, number>();
    expect(allowPerKey(last, 'a', 1000, 1000)).toBe(true);
    expect(allowPerKey(last, 'a', 1500, 1000)).toBe(false);
    expect(allowPerKey(last, 'b', 1500, 1000)).toBe(true);
    expect(allowPerKey(last, 'a', 2000, 1000)).toBe(true);
  });
});

describe('payloads do canal', () => {
  it('recusa objeto torto', () => {
    expect(isValidObject(object('a'))).toBe(true);
    expect(isValidObject(null)).toBe(false);
    expect(isValidObject(object('a', { scale: 0 }))).toBe(false);
    expect(isValidObject(object('a', { conditions: 'queimando' as unknown as string[] }))).toBe(false);
    expect(isValidObject({ ...object('a'), x: 'NaN' })).toBe(false);
    expect(
      isValidObject({ ...object('a'), local: { x: 1 } })
    ).toBe(false);
  });

  it('recusa desenho torto', () => {
    const good = {
      id: 'd',
      scene_id: 's',
      author_id: 'u',
      points: [0, 0, 1, 1],
      color: '#ffffff',
      width: 2,
      created_at: '',
    };
    expect(isValidDrawing(good)).toBe(true);
    expect(isValidDrawing({ ...good, points: [0, 0, 1] })).toBe(false);
    expect(isValidDrawing({ ...good, color: 'url(x)' })).toBe(false);
  });
});
