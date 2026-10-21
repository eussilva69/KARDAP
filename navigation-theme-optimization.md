# Otimização de navegação e temas

## Objetivo
Tornar os painéis administrativo e do lojista rápidos e consistentes, com navegação client-side, prefetch, estados de carregamento adequados e temas independentes/persistentes sem flash visual.

## Tarefas
- [x] Centralizar o tema padrão preto e branco e separar a paleta do painel da paleta do cardápio. → Verificar migração dos dados existentes e seleção “Padrão”.
- [x] Aplicar o tema salvo antes da hidratação e manter as variáveis CSS sincronizadas durante a sessão. → Verificar recarga sem flash e troca imediata.
- [x] Adicionar prefetch inteligente aos destinos do painel e preservar o shell durante transições. → Verificar navegação sem recarga e indicação de progresso.
- [x] Usar skeletons específicos para painel, administração e cardápio. → Verificar geometria e cores em cada rota.
- [x] Remover cores fixas dos componentes administrativos e estados compartilhados relevantes. → Verificar contraste com paletas clara e escura.
- [x] Revisar carregamentos, efeitos e importações assíncronas sem alterar fluxos de negócio. → Verificar ausência de solicitações/remontagens desnecessárias.
- [x] Executar lint, TypeScript, build e testes aplicáveis. → Verificar execução sem regressões.

## Pronto quando
- [x] Painel e cardápio iniciam em #111111/#FFFFFF, podem ser personalizados separadamente e persistem entre sessões.
- [x] As trocas internas usam navegação client-side, prefetch e feedback visual sem tela branca.
- [x] Desktop e mobile preservam os fluxos e a responsividade atuais.

## Observações
- O formato legado `palette.panel` será migrado de forma compatível ao carregar os dados.
- A ferramenta `git` não está disponível neste ambiente; não foi possível criar a branch dedicada prevista nas convenções do projeto.
