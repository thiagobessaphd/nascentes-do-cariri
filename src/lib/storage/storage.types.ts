/**
 * Nascentes do Cariri — Contratos e Tipos Estritos do Módulo de Storage
 */

/**
 * Carga binária aceita pelas operações de armazenamento.
 */
export type StoragePayload = Buffer | Uint8Array | string;

/**
 * Opções de configuração para gravação de arquivos no storage.
 */
export interface StorageUploadOptions {
  readonly pathname: string;
  readonly contentType?: string | undefined;
  readonly isPrivate?: boolean | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

/**
 * Resultado retornado após a gravação bem-sucedida de um arquivo.
 */
export interface StorageUploadResult {
  readonly pathname: string;
  readonly url: string;
  readonly sizeBytes: number;
  readonly contentType: string;
  readonly hashSha256: string;
  readonly uploadedAt: Date;
}

/**
 * Metadados de um arquivo consultado no storage.
 */
export interface StorageFileInfo {
  readonly pathname: string;
  readonly sizeBytes: number;
  readonly contentType: string;
  readonly uploadedAt: Date;
}

/**
 * Contrato de porta de saída (Port) para abstração de provedores de storage (Pattern Strategy / Adapter).
 */
export interface StorageDriver {
  /**
   * Grava um arquivo binário no caminho indicado.
   */
  upload(payload: StoragePayload, options: StorageUploadOptions): Promise<StorageUploadResult>;

  /**
   * Baixa o conteúdo binário integral de um arquivo armazenado.
   */
  download(pathname: string): Promise<Buffer>;

  /**
   * Remove permanentemente um arquivo (usado para rollback de transações com falha).
   */
  delete(pathname: string): Promise<void>;

  /**
   * Consulta os metadados de um arquivo caso ele exista, ou retorna null se não encontrado.
   */
  head(pathname: string): Promise<StorageFileInfo | null>;

  /**
   * Verifica se o arquivo existe no caminho especificado sem baixar seu conteúdo.
   */
  exists(pathname: string): Promise<boolean>;
}

