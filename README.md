# PromptPI Backend

Backend do PromptPI, responsável por receber solicitações do aplicativo, validar a autenticação com Firebase e usar um modelo de IA para gerar prompts personalizados com base no perfil do usuário.

O frontend do projeto está no repositório [PromptPi-Revive](https://github.com/mario2230/PromptPi-Revive).

## Requisitos

- Node.js e npm
- Uma conta/projeto Firebase com autenticação configurada
- Uma chave de API de um provedor de IA compatível com a API de chat completions, como Groq ou Hugging Face

## Iniciar localmente

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie o arquivo de configuração local a partir do exemplo:

   ```bash
   cp .env.example .env
   ```

3. Preencha as variáveis no `.env`:

   - `PORT`: porta do servidor (padrão: `5000`).
   - `ALLOWED_ORIGINS`: origens autorizadas a chamar a API, separadas por vírgula. Em desenvolvimento, inclua a origem usada pelo frontend, por exemplo `http://localhost:8100`.
   - `FIREBASE_SERVICE_ACCOUNT_BASE64`: conteúdo JSON da chave privada de uma conta de serviço Firebase, codificado em Base64. No Linux, gere-o com `base64 -w 0 serviceAccountKey.json`.
   - `AI_BASE_URL`, `AI_API_KEY` e `AI_MODEL`: endereço, chave e modelo do provedor de IA. O exemplo usa Groq; há também valores de exemplo para Hugging Face no `.env.example`.

   Mantenha as credenciais privadas e não envie o `.env` ou a chave JSON do Firebase ao repositório.

4. Inicie o servidor:

   ```bash
   npm start
   ```

Por padrão, a API estará disponível em `http://localhost:5000`.

## Endpoints

### `GET /health`

Verifica se o servidor está ativo. Não exige autenticação.

```bash
curl http://localhost:5000/health
```

Resposta:

```json
{"status":"ok"}
```

### `POST /generate-prompt`

Gera um prompt personalizado. Exige um Firebase ID token válido no cabeçalho `Authorization` e recebe `userMessage`; `profile` é opcional.

```http
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

Exemplo de corpo:

```json
{
  "userMessage": "Crie um plano de estudos de JavaScript para quatro semanas",
  "profile": {
    "contextoProfissional": {
      "profissao": "estudante",
      "area": "desenvolvimento de software",
      "nivel": "iniciante"
    },
    "tecnologias": ["JavaScript"],
    "preferencias": {
      "tom": "direto",
      "prefResposta": "passo a passo"
    },
    "contexto": ["estudos"]
  }
}
```

A resposta normalmente contém `template`, `variaveis`, `promptFinal` e `usadas`. O endpoint retorna `400` se `userMessage` não for enviado, `401` se o token estiver ausente ou inválido e `500` se houver falha ao gerar o prompt.

## Tecnologias

- Node.js e Express
- Firebase Admin para validar tokens de autenticação
- Axios para chamadas ao provedor de IA
- dotenv para carregar configuração local
