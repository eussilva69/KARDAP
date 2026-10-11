import { RotateCw, SearchX } from "lucide-react";
import { Button, SpeedLoader } from "@/components/ui/primitives";

/** Esqueleto do cardápio com a mesma geometria da tela final. Leve, para aparecer antes do resto. */
export function MenuSkeleton() {
  return (
    <div className="kd-menu kd-menu-page" role="status" aria-label="Carregando o cardápio">
      <div className="kd-menu-column">
        <span className="kd-skel kd-menu-skel-cover" />
        <div className="kd-menu-skel-id">
          <span className="kd-skel" style={{ width: 64, height: 64, borderRadius: 14 }} />
          <span style={{ display: "grid", gap: 8, flex: 1 }}>
            <span className="kd-skel" style={{ width: "62%", height: 22 }} />
            <span className="kd-skel" style={{ width: "38%", height: 14 }} />
          </span>
        </div>
        <span className="kd-skel" style={{ height: 40, margin: "0 16px" }} />
        <div className="kd-menu-skel-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="kd-menu-skel-row">
              <span style={{ display: "grid", gap: 8, flex: 1 }}>
                <span className="kd-skel" style={{ width: "70%", height: 16 }} />
                <span className="kd-skel" style={{ width: "92%", height: 12 }} />
                <span className="kd-skel" style={{ width: 64, height: 14 }} />
              </span>
              <span className="kd-skel" style={{ width: 96, height: 96, borderRadius: 12 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Estados sem cardápio: não encontrado, erro de conexão ou demora. */
export function MenuMessage({ status, onRetry }: { status: "not-found" | "error" | "slow" | "unavailable"; onRetry: () => void }) {
  const copy = {
    "not-found": {
      title: "Cardápio não encontrado",
      text: "Este endereço não corresponde a nenhum restaurante. Confira se o QR Code é o da sua mesa ou peça o cardápio à equipe.",
    },
    error: {
      title: "Não foi possível abrir o cardápio",
      text: "Parece um problema de conexão. Tente de novo; se continuar, peça o cardápio à equipe.",
    },
    unavailable: {
      title: "Cardápio indisponível no momento",
      text: "Este cardápio digital está temporariamente fora do ar. Peça o cardápio à equipe do restaurante.",
    },
    slow: {
      title: "A conexão está lenta",
      text: "Ainda estamos buscando os pratos do restaurante. Você pode esperar mais um pouco ou tentar de novo.",
    },
  }[status];
  return (
    <div className="kd-menu kd-menu-page">
      <div className="kd-state" role={status === "error" ? "alert" : "status"}>
        {status === "slow" ? (
          <SpeedLoader large label="Ainda carregando" />
        ) : (
          <span className="kd-empty-icon" aria-hidden>
            <SearchX size={22} />
          </span>
        )}
        <h1 className="kd-state-title">{copy.title}</h1>
        <p className="kd-state-text">{copy.text}</p>
        {(status === "error" || status === "slow") && (
          <Button onClick={onRetry} icon={<RotateCw size={16} />}>
            Tentar de novo
          </Button>
        )}
      </div>
    </div>
  );
}
