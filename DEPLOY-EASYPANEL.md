# Deploy no EasyPanel (Docker)

Este deploy roda **em paralelo** ao deploy atual (Lovable/Cloudflare). Nenhum
arquivo existente do projeto foi alterado — apenas adicionamos `Dockerfile`,
`.dockerignore` e `server.mjs`.

## Como funciona

Na Cloudflare, a plataforma serve os arquivos estáticos (`dist/client`) e só
encaminha o resto para o worker (SSR). Ao auto-hospedar isso não existe, então
`server.mjs` reproduz esse comportamento rodando em **Bun**:

1. Tenta servir o caminho como arquivo estático de `dist/client` (com proteção
   contra path traversal). Os arquivos em `/assets/*` são content-hashed, então
   recebem cache imutável de 1 ano.
2. Se não for um arquivo, encaminha para o handler SSR (`dist/server/index.js`).

O `Dockerfile` é multi-stage com `oven/bun:1`:
- **build**: `bun install --frozen-lockfile` + `bun run build`.
- **runtime**: copia `node_modules` + `dist` + `package.json` + `server.mjs`,
  expõe a porta **3000** e roda `bun server.mjs`.

## Passos no EasyPanel

1. **Criar o serviço**: novo serviço do tipo **App**, apontando para este
   repositório (branch de produção). Build method: **Dockerfile** (raiz do repo).
2. **Porta**: a aplicação escuta em **3000** (via `process.env.PORT`, padrão
   3000). Configure o proxy/domínio do EasyPanel para essa porta.
3. **Variáveis de ambiente** (aba Environment do serviço):

   | Variável | Valor | Observação |
   |---|---|---|
   | `SUPABASE_URL` | `https://oqghoelwiqnpcfmijhny.supabase.co` | URL do projeto Supabase |
   | `SUPABASE_PUBLISHABLE_KEY` | chave `anon`/publishable | usada pela auth no servidor |
   | `SUPABASE_SERVICE_ROLE_KEY` | **chave service_role (SECRETA)** | bypassa RLS — **nunca** commitar |
   | `PORT` | `3000` | opcional (já é o padrão) |

   > As variáveis `VITE_*` (públicas) já vêm embutidas no build a partir do
   > `.env` versionado — **não** precisam ser configuradas no EasyPanel.
   >
   > A `SUPABASE_SERVICE_ROLE_KEY` é lida em runtime via `process.env` e é
   > **secreta**: configure-a apenas aqui no painel, nunca em arquivo versionado.

4. **Deploy**: o EasyPanel constrói a imagem e sobe o container. Acompanhe os
   logs — ao subir deve aparecer `Server listening on http://0.0.0.0:3000`.

## Validação pós-deploy

- `GET /` → **200** com o HTML real (SSR).
- `GET /assets/<arquivo>.js` → **200**, `content-type: text/javascript`.
- Rota inexistente → **404**.

## Testar localmente (opcional)

```bash
docker build -t hora-easypanel .
docker run --rm -p 3000:3000 \
  -e SUPABASE_URL="https://oqghoelwiqnpcfmijhny.supabase.co" \
  -e SUPABASE_PUBLISHABLE_KEY="<anon key>" \
  -e SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
  hora-easypanel
# abra http://localhost:3000
```
