import type { UploadTokenRules } from '@/lib/storage/types';

/**
 * O token de upload aceita no máximo o tamanho que o cliente declarou (até o teto do
 * tipo). Assim a cota diária conta o arquivo de verdade, e quem mentir para menos
 * só consegue enviar menos. Declaração ausente ou inválida fica com o teto.
 */
export function capUploadSize(rules: UploadTokenRules, declared: unknown): UploadTokenRules {
  if (typeof declared !== 'number' || !Number.isInteger(declared) || declared <= 0) {
    return rules;
  }
  return {
    ...rules,
    maximumSizeInBytes: Math.min(rules.maximumSizeInBytes, declared),
  };
}
