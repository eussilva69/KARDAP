/**
 * Fallback de carregamento do Next.js App Router para a rota [...path].
 * Substitui o spinner genérico que aparecia antes do componente App (client) hidratizar.
 * Usa o mesmo sistema de classes .pm-* do cardápio público para consistência visual.
 */
export default function Loading() {
  return (
    <div className="pm-app" aria-busy="true" aria-label="Carregando">
      <div className="pm-column">
        {/* Faixa da marca */}
        <div className="pm-platform">
          <span>KARDAP</span>
        </div>

        {/* Cabeçalho skeleton */}
        <div className="pm-loading-header">
          <span className="pm-loading-logo" aria-hidden />
          <div className="pm-loading-meta">
            <span className="pm-skel" style={{ width: "58%", height: 18 }} aria-hidden />
            <span className="pm-skel" style={{ width: "36%", height: 13 }} aria-hidden />
          </div>
        </div>

        {/* Barra de categorias skeleton */}
        <div className="pm-loading-cats" aria-hidden>
          {[52, 70, 60, 80, 55].map((w, i) => (
            <span key={i} className="pm-skel pm-loading-cat-pill" style={{ width: w }} />
          ))}
        </div>

        {/* Lista de produtos skeleton */}
        <div className="pm-loading-list" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="pm-loading-row">
              <div className="pm-loading-row-text">
                <span className="pm-skel" style={{ width: `${[72, 60, 68, 55][i - 1]}%`, height: 15 }} />
                <span className="pm-skel" style={{ width: "90%", height: 12 }} />
                <span className="pm-skel" style={{ width: "95%", height: 12 }} />
                <span className="pm-skel" style={{ width: 52, height: 13 }} />
              </div>
              <span className="pm-skel pm-loading-thumb" aria-hidden />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
