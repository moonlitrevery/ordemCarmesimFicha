import { NextResponse } from 'next/server';
import { storage, type UploadTokenRules } from '@/lib/storage';
import type { createClient } from '@/lib/supabase/server';
import { getUploadAccess } from '@/lib/vtt/assets/server';
import {
  canRoleUploadKind,
  hasThumb,
  isAssetKind,
  isRequestedPathnameValid,
  isRequestedThumbPathnameValid,
  maxBytesForKind,
  THUMB_MAX_BYTES,
  uploadMimesForKind,
} from '@/lib/vtt/assets/rules';
import { isTableFileKind, tableFileUploadRules } from '@/lib/vtt/docs/rules';
import { getTableFileAccess } from '@/lib/vtt/docs/server';
import { capUploadSize } from '@/lib/vtt/upload-budget';

/** Recusa com texto que pode ir para a tela. Qualquer outro erro vira genérico. */
class UploadDenied extends Error {}

/**
 * Jogador tem cota diária (migração 027): sem ela, dava para encher o Blob do mês
 * pedindo tokens. A mestra não passa por aqui.
 */
async function reserve(
  supabase: ReturnType<typeof createClient>,
  rules: UploadTokenRules
): Promise<UploadTokenRules> {
  const { data, error } = await supabase.rpc('reserve_upload', {
    p_bytes: rules.maximumSizeInBytes,
  });
  if (error) {
    console.error('[upload] reserve_upload falhou', error);
    throw new UploadDenied('Envio indisponível agora. Tente de novo mais tarde.');
  }
  if (data !== true) {
    throw new UploadDenied('Limite diário de envios atingido. Tente de novo amanhã.');
  }
  return rules;
}

/** O cliente pergunta antes de enviar: upload() não repassa erro do servidor. */
export async function GET() {
  return NextResponse.json({ configured: storage.isConfigured() });
}

export async function POST(request: Request) {
  if (!storage.isConfigured()) {
    return NextResponse.json({ error: 'blob_not_configured' }, { status: 503 });
  }

  try {
    const body: unknown = await request.json();
    const result = await storage.createUploadToken(
      request,
      body,
      async (pathname, clientPayload) => {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(clientPayload ?? '{}') as Record<string, unknown>;
        } catch {
          throw new UploadDenied('Pedido inválido.');
        }
        if (isTableFileKind(payload.kind)) {
          // Documento e relatório são da mesa: `can_upload_asset` não diz nada sobre ela.
          const access = await getTableFileAccess(payload.tableId);
          if (!access) throw new UploadDenied('Sessão expirada.');
          if (!access.role) throw new UploadDenied('Sem permissão para enviar nesta mesa.');
          const rules = tableFileUploadRules({
            kind: payload.kind,
            role: access.role,
            category: payload.category,
            mime: payload.mime,
            pathname,
          });
          if (typeof rules === 'string') throw new UploadDenied(rules);
          const capped = capUploadSize(rules, payload.size);
          // Dona da mesa é sempre mestra (`tables_insert`): sem cota.
          return access.role === 'gm' ? capped : reserve(access.supabase, capped);
        }

        const access = await getUploadAccess();
        if (!access) throw new UploadDenied('Sessão expirada.');
        if (!access.canUpload) throw new UploadDenied('Sem permissão para enviar.');

        const { kind, thumb } = payload;
        if (!isAssetKind(kind)) throw new UploadDenied('Tipo de arquivo inválido.');
        if (!canRoleUploadKind(access.isMestre, kind)) {
          throw new UploadDenied('Sem permissão para enviar este tipo.');
        }
        let rules: UploadTokenRules;
        if (thumb === true) {
          if (!hasThumb(kind) || !isRequestedThumbPathnameValid(pathname, kind)) {
            throw new UploadDenied('Caminho de miniatura inválido.');
          }
          rules = {
            allowedContentTypes: uploadMimesForKind(kind),
            maximumSizeInBytes: THUMB_MAX_BYTES,
          };
        } else {
          if (!isRequestedPathnameValid(pathname, kind)) {
            throw new UploadDenied('Caminho de arquivo inválido.');
          }
          rules = {
            allowedContentTypes: uploadMimesForKind(kind),
            maximumSizeInBytes: maxBytesForKind(kind),
          };
        }
        const capped = capUploadSize(rules, payload.size);
        return access.isMestre ? capped : reserve(access.supabase, capped);
      }
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UploadDenied) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[upload] token recusado', error);
    return NextResponse.json({ error: 'Envio recusado.' }, { status: 400 });
  }
}
