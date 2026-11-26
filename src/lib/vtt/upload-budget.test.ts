import { describe, expect, it } from 'vitest';
import { capUploadSize } from './upload-budget';

const RULES = { allowedContentTypes: ['image/png'], maximumSizeInBytes: 1000 };

describe('capUploadSize', () => {
  it('usa o tamanho declarado quando cabe no teto', () => {
    expect(capUploadSize(RULES, 400).maximumSizeInBytes).toBe(400);
  });

  it('nunca passa do teto do tipo', () => {
    expect(capUploadSize(RULES, 5000).maximumSizeInBytes).toBe(1000);
  });

  it('ignora declaração inválida', () => {
    for (const declared of [undefined, null, '400', 0, -1, 1.5, Number.NaN]) {
      expect(capUploadSize(RULES, declared).maximumSizeInBytes).toBe(1000);
    }
  });
});
