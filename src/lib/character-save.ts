import type { createClient } from '@/lib/supabase/client';
import { serverBackpack, type ServerBackpack } from '@/lib/resource-sync';

type Client = ReturnType<typeof createClient>;

export type CharacterSaveResult =
  | { status: 'ok'; rev: number | null }
  | { status: 'conflict' }
  | { status: 'error' };

/**
 * Update da ficha. Com `backpackRev`, o patch leva mochila/dinheiro e só grava se a
 * versão ainda for essa (ver `nextBackpackRev`): se não pegar linha, é conflito e
 * quem chamou relê com `fetchBackpack`.
 */
export async function updateCharacterRow(
  supabase: Client,
  id: string,
  patch: Record<string, unknown>,
  backpackRev: number | null
): Promise<CharacterSaveResult> {
  let query = supabase.from('characters').update(patch).eq('id', id);
  if (backpackRev !== null) query = query.eq('backpack_rev', backpackRev);
  const { data, error } = await query.select('backpack_rev');
  if (error) return { status: 'error' };
  if (!data || data.length === 0) {
    return backpackRev !== null ? { status: 'conflict' } : { status: 'error' };
  }
  // Sem mochila no patch, a versão que voltou pode incluir mudança remota que ainda
  // não chegou aqui: não serve.
  return {
    status: 'ok',
    rev: backpackRev !== null ? (data[0] as { backpack_rev: number }).backpack_rev : null,
  };
}

export async function fetchBackpack(supabase: Client, id: string): Promise<ServerBackpack | null> {
  const { data } = await supabase
    .from('characters')
    .select('inventory, money, backpack_rev')
    .eq('id', id)
    .maybeSingle();
  return serverBackpack(data);
}

const RPC_ERRORS: Record<string, string> = {
  saldo_insuficiente: 'Dinheiro insuficiente na ficha.',
  caixa_insuficiente: 'O caixa da party não tem isso tudo.',
  quantia_invalida: 'Quantia inválida.',
  item_mudou: 'Esse item mudou enquanto isso. Confira e tente de novo.',
  quantidade_invalida: 'Quantidade inválida.',
  sem_permissao: 'Sem permissão pra isso.',
};

export type MoneyRpc =
  | 'move_character_money'
  | 'party_cash_move'
  | 'party_send_item'
  | 'party_take_item';

export type RpcResult =
  | { ok: true; data: Record<string, unknown>; backpack: ServerBackpack | null }
  | { ok: false; message: string };

/** RPC que mexe em mochila/dinheiro: devolve a mochila nova (se a ficha entrou) pronta pra aplicar. */
export async function callMoneyRpc(
  supabase: Client,
  fn: MoneyRpc,
  args: Record<string, unknown>
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const code = Object.keys(RPC_ERRORS).find((key) => error.message.includes(key));
    return { ok: false, message: code ? RPC_ERRORS[code] : 'Não foi possível concluir. Tente de novo.' };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return { ok: true, data: row, backpack: serverBackpack(row) };
}
