export type AdbErrorCode =
  | 'INVALID_ADDRESS'
  | 'UNREACHABLE'
  | 'REFUSED'
  | 'TIMEOUT'
  | 'AUTH_REJECTED'
  | 'CONNECTION_LOST'
  | 'PROTOCOL'
  | 'NOT_CONNECTED'
  | 'COMMAND_FAILED'
  | 'CANCELLED'
  | 'UNSUPPORTED_TEXT'
  | 'INVALID_ARGUMENT';

export class AdbError extends Error {
  constructor(
    public readonly code: AdbErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AdbError';
  }
}

/** Errors after which the session is presumed dead and a reconnect makes sense. */
export const LINK_ERRORS: ReadonlySet<AdbErrorCode> = new Set(['UNREACHABLE', 'REFUSED', 'TIMEOUT', 'CONNECTION_LOST']);

export function toAdbError(e: unknown): AdbError {
  if (e instanceof AdbError) return e;
  return new AdbError('PROTOCOL', e instanceof Error ? e.message : String(e));
}

export function describeError(e: AdbError): string {
  switch (e.code) {
    case 'INVALID_ADDRESS':
      return e.message;
    case 'UNREACHABLE':
      return 'Projetor inacessível. Confira se o celular e o projetor estão no mesmo Wi-Fi.';
    case 'REFUSED':
      return 'O projetor recusou a conexão: a porta ADB está fechada. Reative o ADB por rede no projetor.';
    case 'TIMEOUT':
      return 'Tempo esgotado. Se o projetor exibiu um pedido de autorização, aceite-o e tente de novo.';
    case 'AUTH_REJECTED':
      return 'O projetor recusou a chave ADB deste celular.';
    case 'CONNECTION_LOST':
      return 'A conexão com o projetor caiu.';
    case 'NOT_CONNECTED':
      return 'Não conectado.';
    case 'COMMAND_FAILED':
      return `O comando falhou no projetor: ${e.message}`;
    case 'CANCELLED':
      return 'Operação cancelada.';
    case 'UNSUPPORTED_TEXT':
    case 'INVALID_ARGUMENT':
      return e.message;
    case 'PROTOCOL':
      return `Resposta ADB inesperada: ${e.message}`;
  }
}
