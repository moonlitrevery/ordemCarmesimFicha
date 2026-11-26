import 'server-only';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { createClient } from '@/lib/supabase/server';
import { visibleStaticItems, type StaticManifestItem } from './static';

interface Catalog {
  body: string;
  etag: string;
}

// Só muda com um novo deploy, que é uma nova instância: lê uma vez e guarda.
let manifest: Promise<StaticManifestItem[]> | null = null;
const catalogs = new Map<boolean, Catalog>();

/** Primeira resposta desta instância: é o que denuncia cold start no diagnóstico. */
let coldStart = true;

export function takeColdStart(): boolean {
  const cold = coldStart;
  coldStart = false;
  return cold;
}

export function readManifest(): Promise<StaticManifestItem[]> {
  manifest ??= readFile(
    path.join(process.cwd(), 'generated', 'vtt-manifest.json'),
    'utf8'
  ).then(
    (raw) => (JSON.parse(raw) as { items: StaticManifestItem[] }).items,
    () => []
  );
  return manifest;
}

/** O que não depende da cena: tudo para a mestra, o liberado para os outros. */
export async function catalogFor(isMestre: boolean): Promise<Catalog> {
  const cached = catalogs.get(isMestre);
  if (cached) return cached;
  const body = JSON.stringify({
    items: visibleStaticItems(await readManifest(), isMestre, []),
  });
  const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
  const catalog = { body, etag };
  catalogs.set(isMestre, catalog);
  return catalog;
}

/**
 * Uma chamada ao Supabase só. `getSession` não vai à rede e não prova nada, mas
 * a identidade não vem dela: o PostgREST confere o JWT e `is_mestre` usa
 * `auth.uid()`. Token forjado ou vencido dá erro, que vira "sem sessão".
 */
export async function readStaticAccess() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase.rpc('is_mestre');
  if (error) return null;
  return { supabase, isMestre: data === true };
}
