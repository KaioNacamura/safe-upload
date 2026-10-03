import path from "node:path";

/**
 * Jeito ERRADO, mantido aqui só para o teste mostrar a falha:
 * "/dados/uploads-falso/x.png".startsWith("/dados/uploads") é true.
 */
export function estaDentroIngenuo(base: string, alvo: string): boolean {
  return path.resolve(alvo).startsWith(path.resolve(base));
}

/** Jeito certo: calcula o caminho relativo e vê se ele sai da pasta. */
export function estaDentro(base: string, alvo: string): boolean {
  const relativo = path.relative(path.resolve(base), path.resolve(alvo));
  return relativo !== "" && !relativo.startsWith("..") && !path.isAbsolute(relativo);
}

/** Junta os pedaços e garante que o resultado continua dentro da base. */
export function caminhoSeguro(base: string, ...partes: string[]): string {
  const alvo = path.resolve(base, ...partes);
  if (!estaDentro(base, alvo)) {
    throw new Error(`Caminho fora da pasta permitida: ${partes.join("/")}`);
  }
  return alvo;
}
