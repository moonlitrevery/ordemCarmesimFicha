import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
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
        const payload = JSON.parse(clientPayload ?? '{}') as Record<string, unknown>;
        if (isTableFileKind(payload.kind)) {
          // Documento e relatório são da mesa: `can_upload_asset` não diz nada sobre ela.
          const access = await getTableFileAccess(payload.tableId);
          if (!access) throw new Error('Sessão expirada.');
          if (!access.role) throw new Error('Sem permissão para enviar nesta mesa.');
          const rules = tableFileUploadRules({
            kind: payload.kind,
            role: access.role,
            category: payload.category,
            mime: payload.mime,
            pathname,
          });
          if (typeof rules === 'string') throw new Error(rules);
          return rules;
        }

        const access = await getUploadAccess();
        if (!access) throw new Error('Sessão expirada.');
        if (!access.canUpload) throw new Error('Sem permissão para enviar.');

        const { kind, thumb } = payload;
        if (!isAssetKind(kind)) throw new Error('Tipo de arquivo inválido.');
        if (!canRoleUploadKind(access.isMestre, kind)) {
          throw new Error('Sem permissão para enviar este tipo.');
        }
        if (thumb === true) {
          if (
            !hasThumb(kind) ||
            !isRequestedThumbPathnameValid(pathname, kind)
          ) {
            throw new Error('Caminho de miniatura inválido.');
          }
          return {
            allowedContentTypes: uploadMimesForKind(kind),
            maximumSizeInBytes: THUMB_MAX_BYTES,
          };
        }
        if (!isRequestedPathnameValid(pathname, kind)) {
          throw new Error('Caminho de arquivo inválido.');
        }

        return {
          allowedContentTypes: uploadMimesForKind(kind),
          maximumSizeInBytes: maxBytesForKind(kind),
        };
      }
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Envio recusado.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
