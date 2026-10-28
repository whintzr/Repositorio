# Organizador de Arquivos

Sistema web para organizar documentos em pastas reais do computador, com abas por
formato (Word, PowerPoint, Excel e Download), tipos, filtros e busca.

**No ar:** https://organizador-arquivos.vercel.app

## Como funciona

É uma página única (`index.html`), sem servidor e sem banco de dados. Os arquivos
ficam no computador de quem usa: o sistema grava direto numa pasta escolhida pelo
usuário, através da File System Access API do navegador. Nada é enviado para a
internet.

Ao conectar uma pasta, o sistema cria sozinho as subpastas `Word`, `PowerPoint`,
`Excel` e `Download`, e guarda os tipos de cada documento em `_sistema.json`.

Requer Google Chrome ou Microsoft Edge atualizado.

## Uso

Abra o endereço acima, navegue à vontade e clique em **Conectar pasta** quando
quiser adicionar arquivos.

## Deploy

Publicação automática na Vercel a cada push na branch `main`.
