/**
 * Web Worker de imagens: decodificar, redimensionar e codificar fora da thread principal,
 * para a tela não travar com fotos grandes de celular.
 */
import { ImageProcessingError, processImage, type CoreInput } from "./image-core";

type Request = { id: number } & CoreInput;

// Tipos do DOM tratam `self` como Window; no worker, postMessage não recebe origem.
const scope = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage(message: unknown): void };

scope.onmessage = async (event) => {
  const { id, ...input } = event.data;
  try {
    const result = await processImage(input);
    scope.postMessage({ id, ok: true, result });
  } catch (error) {
    const code = error instanceof ImageProcessingError ? error.code : "processing_failed";
    scope.postMessage({ id, ok: false, code, message: String((error as Error)?.message ?? error) });
  }
};
