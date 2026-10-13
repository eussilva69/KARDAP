/** Logs em JSON de uma linha: o Cloud Logging lê `severity` e `message` e indexa o resto. */

export type Fields = Record<string, unknown>;
export type Logger = {
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
  child(fields: Fields): Logger;
};

export function createLogger(base: Fields = {}, write: (line: string) => void = (line) => process.stdout.write(line + "\n")): Logger {
  const emit = (severity: string) => (message: string, fields: Fields = {}) => {
    const payload: Fields = { severity, message, ...base, ...fields };
    if (payload.error instanceof Error) payload.error = { name: payload.error.name, message: payload.error.message, stack: payload.error.stack };
    write(JSON.stringify(payload));
  };
  return {
    info: emit("INFO"),
    warn: emit("WARNING"),
    error: emit("ERROR"),
    child: (fields) => createLogger({ ...base, ...fields }, write),
  };
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {}, child: () => silentLogger };
