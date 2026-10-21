import { RouteLoading } from "@/components/route-loading";

/**
 * Fallback de carregamento do Next.js App Router para a rota [...path].
 * Usa o mesmo skeleton do cardápio em vídeo — sem desvios.
 */
export default function Loading() {
  return <RouteLoading />;
}

