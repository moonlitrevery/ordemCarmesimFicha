export interface UploadTokenRules {
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
}

export interface StoredFile {
  size: number;
  contentType: string;
  pathname: string;
}

/** Troca de provedor = nova implementação desta interface. */
export interface StorageProvider {
  isConfigured: () => boolean;
  /** `authorize` lança erro para recusar; o retorno define as regras do token. */
  createUploadToken: (
    request: Request,
    body: unknown,
    authorize: (
      pathname: string,
      clientPayload: string | null
    ) => Promise<UploadTokenRules>
  ) => Promise<unknown>;
  /** O arquivo pertence a este storage? */
  ownsUrl: (url: string) => boolean;
  /** Dados reais do arquivo; `null` se não existe. */
  stat: (url: string) => Promise<StoredFile | null>;
  delete: (urls: string[]) => Promise<void>;
}
