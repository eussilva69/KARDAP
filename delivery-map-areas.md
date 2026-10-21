# Entrega por área no mapa

## Objetivo
Adicionar áreas circulares e faixas geográficas ao modal de delivery, calculando o frete exclusivamente no backend a partir de coordenadas validadas.

## Tarefas
- [x] Definir tipos, validação e função pura de seleção da taxa geográfica.
- [x] Persistir configuração geográfica isolada por restaurante no Firestore.
- [x] Geocodificar e reutilizar coordenadas do endereço no checkout.
- [x] Integrar o cálculo geográfico às APIs de taxa e criação do pedido.
- [x] Criar editor Google Maps responsivo dentro do modal existente.
- [x] Exibir prévia, faixas, áreas independentes, edição, arraste e exclusão.
- [x] Adicionar testes de limites, sobreposição, alterações e ausência de cobertura.
- [x] Executar testes, tipos, auditoria de diff e build.

## Concluído quando
- [x] Nenhuma área acumula taxas e o backend sempre recalcula o valor.
- [x] Bairro e taxa fixa continuam funcionando sem regressão.
- [x] Configuração e cálculo permanecem isolados por restaurante.
