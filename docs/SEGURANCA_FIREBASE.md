# Segurança Firebase

As regras em `firestore.rules` negam por padrão. Leitura e escrita exigem membro ativo do restaurante. Apenas o proprietário administra membros; documentos financeiros não aceitam escrita direta do cliente e devem ser criados por endpoint/Admin SDK.

O cardápio público deve ser projetado em `cardapiosPublicos/{restaurantId}` com campos publicáveis, em vez de expor produtos administrativos. Vídeos e imagens de produto são públicos para reprodução, mas só membros podem enviar; limite de vídeo é 100 MB e imagem é 10 MB.

Antes de produção: habilite Email/Senha no Firebase Auth, configure a service account somente no ambiente do servidor, aplique App Check, e substitua URLs públicas quando houver mídia administrativa privada.
