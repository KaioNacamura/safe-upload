# safe-upload

Upload de imagens em Node com Express, tratando problemas que encontrei numa auditoria de um sistema real:

1. **Checar a pasta com `startsWith`.** `"/dados/uploads-falso/x.png".startsWith("/dados/uploads")` dá `true`, então um caminho numa pasta vizinha passava como se estivesse dentro.
2. **Referência vinda do cliente.** O formulário mandava a URL e a chave da imagem, e o servidor aceitava sem conferir de quem ela era.
3. **Limite fora de sincronia.** A tela prometia fotos de 10 MB, mas o servidor só aceitava 1 MB por requisição. O usuário recebia erro sem entender por quê.

Aqui eu refiz o upload do zero cobrindo esses pontos, e ainda confiro o tipo real do arquivo.

## Como cada um foi resolvido

| Problema | Solução | Arquivo |
| --- | --- | --- |
| Fronteira de pasta | `path.relative` entre a pasta e o destino; se o resultado começa com `..` ou é absoluto, recusa | `src/paths.ts` |
| Tipo do arquivo | Lê os primeiros bytes (magic bytes) e só aceita PNG, JPEG e WebP. O nome no disco é um UUID gerado pelo servidor | `src/image-type.ts` |
| Tamanho | Um limite só, aplicado no servidor: o `multer` para de ler em 2 MB e a API responde 413 dizendo o limite | `src/app.ts` |
| Dono | O cliente só manda o id; o caminho no disco nunca vem dele. Cada arquivo guarda quem enviou. Outro usuário recebe 404, a mesma resposta de um arquivo que não existe, para não revelar que o id é válido | `src/app.ts` |

O arquivo também é servido com `X-Content-Type-Options: nosniff`, para o navegador não tentar adivinhar outro tipo.

O jeito errado de checar a pasta (`estaDentroIngenuo`) ficou no código de propósito, só para o teste mostrar a falha lado a lado com o jeito certo.

## Rotas

Neste exemplo o usuário vem no cabeçalho `X-User-Id`. Num sistema real ele viria da sessão de login, nunca de um campo escolhido pelo cliente.

| Método | Rota | O que faz |
| --- | --- | --- |
| POST | `/files` | envia a imagem no campo `file` (multipart) |
| GET | `/files/:id` | baixa, se o arquivo for seu |
| DELETE | `/files/:id` | apaga, se o arquivo for seu |

## Rodando

Precisa de Node 20 ou mais novo.

```bash
npm install
npm start
```

Sobe em `http://localhost:3002` e salva os arquivos na pasta `uploads/`. Testando no Git Bash:

```bash
curl -H "X-User-Id: ana" -F "file=@minha-foto.png" http://localhost:3002/files
```

## Testes

```bash
npm test
```

São 10 testes. Entre eles:

- `startsWith` aceita a pasta vizinha e a função certa recusa;
- `../`, `../../etc` e caminho absoluto são recusados;
- um texto enviado como `image/png` recebe 415;
- um arquivo de 2 MB e um pouco recebe 413;
- um nome original `../../../fora.png` vira um UUID dentro da pasta do usuário;
- outro usuário recebe 404 ao tentar baixar ou apagar.

Também tirei a checagem de dono do código e rodei de novo: o teste de dono falhou. Voltei a checagem e ele passou.

## Limites

A lista de arquivos fica em memória para o exemplo rodar sem banco. Num sistema real ela iria para uma tabela, com o id do dono numa coluna.
