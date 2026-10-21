/**
 * Identificação da conta demonstrativa (docs/DEMO.md). Módulo puro, usado no navegador, no servidor e no script de
 * seed. A demonstração é reconhecida pelo id fixo E pela marca `isDemo` gravada pelo servidor: só a marca não basta,
 * para um restaurante real nunca ser tratado como demonstração (restauração, métricas do admin).
 */

export const DEMO_RESTAURANT_ID = "demo-brasa-e-sabor";
export const DEMO_SLUG = "brasa-e-sabor-demo";
export const DEMO_OWNER_EMAIL = "demo@kardapp.online";

/** Pasta do Storage com a cópia mestra da mídia (fora de restaurantes/: as regras negam acesso de qualquer cliente). */
export const DEMO_MEDIA_PREFIX = `demo-media/${DEMO_RESTAURANT_ID}`;

export function isDemoRestaurant(id: string | null | undefined, data?: Record<string, unknown> | null): boolean {
  return id === DEMO_RESTAURANT_ID && (data === undefined || data?.isDemo === true);
}
