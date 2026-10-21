# Áreas geográficas do delivery

- O editor usa uma chave web separada (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) restrita por domínio e à Maps JavaScript API.
- A origem inicial é geocodificada a partir do endereço cadastrado do restaurante e pode ser ajustada manualmente no mapa.
- O modelo possui faixas concêntricas da loja e áreas independentes com centros próprios.
- Faixas concêntricas são intervalos não sobrepostos; áreas independentes sobrepostas aplicam a menor taxa válida.
- Coordenadas, raios e taxas são validados novamente no backend antes da criação do pedido.
