# Organizador de Arquivos

Sistema web para organizar documentos em abas por formato (Word, PowerPoint,
Excel e Download), com tipos, filtros, busca, pastas e acesso pelo celular.

**No ar:** https://organizador-arquivos.vercel.app

## Como funciona

Os arquivos ficam guardados na nuvem (Vercel Blob, armazenamento privado), e não
no computador de quem usa. Por isso o celular continua funcionando mesmo com o
computador desligado: tudo o que for feito no celular aparece no site e vice-versa.

- **Contas:** cada pessoa entra com usuário e senha próprios. No primeiro acesso
  o sistema pede a criação da conta de administrador.
- **Celular:** em *Configurações → Conectar com dispositivo móvel* o sistema gera
  um QR Code. O celular lê, abre o site já conectado e pode ver, enviar, baixar e
  excluir arquivos e criar pastas. O código vale 10 minutos e só funciona uma vez.
- **Envio:** o arquivo vai do navegador direto para o armazenamento, por uma URL
  assinada de curta duração, sem limite prático de tamanho.
- **Download:** o link também é assinado e expira em 10 minutos, então nada fica
  exposto publicamente.

O armazenamento só aceita caminhos sem acentos, então cada arquivo e pasta tem um
nome técnico em ASCII; o nome que aparece na tela fica guardado em `sistema/meta.json`.

## Estrutura

| Caminho | O que é |
|---|---|
| `index.html` | Interface completa (login, arquivos, configurações) |
| `api/_lib.js` | Armazenamento, sessões, senhas e caminhos |
| `api/auth.js` | Primeiro acesso, login, logout e pareamento do celular |
| `api/arquivos.js` | Listar, enviar, baixar, excluir, pastas e tipos |
| `api/usuarios.js` | Contas de acesso |
| `vendor/qrcode.min.js` | Gerador de QR Code, servido pelo próprio site |

## Configuração

Variáveis de ambiente (já criadas na Vercel):

- `BLOB_READ_WRITE_TOKEN` — acesso ao armazenamento privado
- `SESSION_SECRET` — assina os cookies de sessão e os códigos de pareamento

Para rodar localmente: `npx vercel env pull .env.local` e `npx vercel dev`.

## Deploy

Publicação automática na Vercel a cada push na branch `main`.
