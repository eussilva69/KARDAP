# Imagens: otimização no navegador e envio ao Storage

Toda imagem enviada pelo painel ou pela configuração inicial passa pelo mesmo serviço antes de subir:

```
arquivo escolhido → validação (formato real, tamanho) → Web Worker: decodifica, aplica orientação,
redimensiona, converte → duas versões (principal + pequena) → Firebase Storage → URLs no Firestore
```

| Parte | Arquivo |
| --- | --- |
| Configurações, validação e chamada do worker | `lib/image-optimization.ts` |
| Processamento (decodificar, redimensionar, codificar) | `lib/image-core.ts` |
| Web Worker | `lib/image-worker.ts` |
| Envio ao Storage, exclusão de imagens substituídas | `lib/storage.ts` |

## Configurações

| Tipo | Lado maior | Qualidade | Uso |
| --- | --- | --- | --- |
| Foto de produto | 1200 px | 85% | tela cheia do cardápio |
| Miniatura | 400 px | 75% | lista do cardápio e do painel |
| Logo | 1200 px | 90% | arquivo de referência |
| Avatar | 512 px | 82% | logo no cardápio e no painel |
| Banner (capa) | 1920 px | 85% | capa em telas largas ou de alta densidade |
| Capa reduzida | 960 px | 82% | capa em celulares 2× e miniatura do painel |
| Categoria | 1000 px | 82% | definida para quando houver imagem de categoria (hoje não há envio) |

Cada envio gera duas versões: produto (1200 + 400), logo (1200 + 512) e capa (1920 + 960). A proporção é mantida e
nada é ampliado. Transparência é preservada (WebP com alfa, ou PNG). A orientação EXIF de fotos de celular é aplicada
nos pixels e os metadados (inclusive localização) não vão para o arquivo publicado.

Se a conversão ficar maior que o original, o serviço testa o formato do original recodificado e fica com o menor;
o arquivo original só é publicado sem alteração quando já está no tamanho certo, é o menor e não tem EXIF.

## Safari

O Safari (iPhone e Mac) mostra WebP mas não consegue gerar WebP pelo canvas. Nele, a imagem sai em JPEG
(ou PNG, quando tem transparência), com o mesmo redimensionamento. PNG com transparência fica bem maior que WebP
nesse caso; é uma limitação do navegador, não do serviço.

## Storage

As pastas continuam as mesmas (já protegidas por estabelecimento nas regras):

```
restaurantes/{id}/produtos/imagens/{produto}-{imagem}.webp      e  ...-sm.webp
restaurantes/{id}/logos/logo-{imagem}.webp                       e  ...-sm.webp
restaurantes/{id}/capas/capa-{imagem}.webp                       e  ...-sm.webp
```

- `contentType` do formato real e `Cache-Control: public, max-age=31536000, immutable` (nome novo a cada envio,
  então a imagem nunca muda dentro da mesma URL).
- O envio só termina depois que o Storage confirmou os dois arquivos e devolveu as URLs; se um falhar ou o envio for
  cancelado, o outro é apagado.
- Imagem substituída ou removida é apagada depois de gravada a nova (logo e capa: depois do tempo do "Desfazer").
  As regras do Storage separam criação e exclusão nas pastas de logo, capa e fotos de produto: com uma regra única de
  escrita que olha o arquivo enviado, a exclusão era sempre recusada e as imagens antigas ficavam órfãs.
  Só arquivos gerados por este fluxo são apagados; imagens antigas continuam no Storage e no ar.

## Firestore

- Produto: `image` (principal), `imageThumb` (pequena) e `imageMeta` (largura, altura, formato, tamanhos).
- Marca: `brand.logo`, `brand.logoSmall`, `brand.cover`, `brand.coverSmall`.
- Registros antigos, só com `image`, `logo` e `cover`, continuam funcionando: as telas usam a versão pequena quando
  existe e a principal quando não.

## Atualização em tempo real

O cardápio público escuta o documento do restaurante, os produtos e as categorias com `onSnapshot`. Logo, capa,
fotos e configurações aparecem para quem já está com o cardápio aberto assim que o Firestore confirma a gravação.
Cada imagem nova tem URL nova, então não há versão antiga presa em cache. Testes: `docs/TESTES.md`.

## Limites

Arquivo escolhido: JPG, PNG ou WebP, até 25 MB e até 60 megapixels. HEIC tem mensagem própria (o iPhone converte para
JPG quando a câmera está em "Mais Compatível").
