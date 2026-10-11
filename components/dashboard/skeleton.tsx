import { RotateCw } from "lucide-react";
import { KardapLogo } from "@/components/brand/logo";
import { Button, Card, EmptyState, SpeedLoader } from "@/components/ui/primitives";

/**
 * Esqueleto do painel com a mesma geometria da tela final (evita salto de layout).
 * Fica em um arquivo leve para aparecer antes de o código do painel terminar de carregar.
 */
export function DashboardSkeleton({ error, slow, onRetry }: { error?: string; slow?: boolean; onRetry?: () => void } = {}) {
  const retry = onRetry || (() => location.reload());
  if (error || slow)
    return (
      <div className="kd kd-center">
        <Card className="kd-load-card">
          {error ? (
            <EmptyState
              title="Não foi possível abrir o painel"
              description={error}
              action={
                <Button variant="secondary" icon={<RotateCw size={15} />} onClick={retry}>
                  Tentar novamente
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<SpeedLoader label="Ainda carregando" />}
              title="Está demorando mais que o normal"
              description="Ainda estamos buscando os dados do seu restaurante. Se a internet estiver instável, tente de novo."
              action={
                <Button variant="secondary" icon={<RotateCw size={15} />} onClick={retry}>
                  Tentar novamente
                </Button>
              }
            />
          )}
        </Card>
      </div>
    );
  return (
    <div className="kd" aria-busy="true">
      <aside className="kd-side kd-side--ghost" aria-hidden>
        <div className="kd-side-top">
          <span className="kd-side-logo">
            <KardapLogo width={128} alt="" />
          </span>
        </div>
        <div className="kd-nav">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="kd-skel kd-skel--nav" />
          ))}
        </div>
      </aside>
      <div className="kd-main-wrap">
        <header className="kd-topbar" aria-hidden>
          <span className="kd-topbar-logo">
            <KardapLogo width={104} alt="" />
          </span>
        </header>
        <main className="kd-main" role="status" aria-label="Carregando o painel">
          <div className="kd-stack">
            <span className="kd-skel" style={{ width: "min(320px, 70%)", height: 44 }} />
            <div className="kd-overview">
              <span className="kd-skel" style={{ height: 320 }} />
              <span className="kd-skel" style={{ height: 320 }} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
