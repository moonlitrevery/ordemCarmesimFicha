'use client';

import { PLAYER_KINDS } from '@/lib/vtt/assets/rules';
import { AssetUploader } from './AssetUploader';

export function PlayerUploadPanel({ onUploaded }: { onUploaded: () => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-muted">
        Envie uma imagem para a mestra aprovar. Depois de aprovada, ela entra na
        biblioteca da mesa.
      </p>
      <AssetUploader
        allowedKinds={PLAYER_KINDS}
        doneMessage={(count) =>
          count === 1
            ? 'Enviada! Aguardando aprovação da mestra.'
            : `${count} imagens enviadas. Aguardando aprovação da mestra.`
        }
        onUploaded={onUploaded}
      />
    </div>
  );
}
