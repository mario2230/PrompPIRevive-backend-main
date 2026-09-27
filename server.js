require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(bodyParser.json());

// ---------------------------------------------------------------------------
// CORS — troque a lista pelos domínios reais do seu app (dev + produção)
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:8100')
  .split(',')
  .map((o) => o.trim());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ---------------------------------------------------------------------------
// Firebase Admin — reaproveita o MESMO projeto que você já usa no login
// Gere a chave em: Firebase Console > Configurações do projeto > Contas de
// serviço > Gerar nova chave privada, e coloque o conteúdo (em base64) na
// variável de ambiente FIREBASE_SERVICE_ACCOUNT_BASE64.
// ---------------------------------------------------------------------------
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware: valida o idToken do Firebase enviado pelo app Ionic/Vue
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const idToken = authHeader.split(' ')[1];
  try {
    req.user = await admin.auth().verifyIdToken(idToken);
    next();
  } catch (err) {
    console.error('Falha ao verificar token:', err.message);
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// ---------------------------------------------------------------------------
// Motor de IA — chat completion (não usa mais o bloom/text-generation)
// Funciona tanto com a HF (router.huggingface.co) quanto com Groq, trocando
// só a env AI_BASE_URL / AI_API_KEY / AI_MODEL.
// ---------------------------------------------------------------------------
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1';
const AI_API_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

// Formato real salvo em users/{uid} pelo AuthService.salvarPerfil (ver
// UserProfile em service/AuthService.ts). Campos como idioma/estilo ainda
// não existem no onboarding atual — por isso ficam com fallback neutro.
function buildSystemPrompt(profile = {}) {
  const profissao = profile?.contextoProfissional?.profissao ?? 'não informado';
  const area = profile?.contextoProfissional?.area ?? 'não informado';
  const nivel = profile?.contextoProfissional?.nivel ?? 'não informado';
  const tom = profile?.preferencias?.tom ?? 'neutro';
  const prefResposta = profile?.preferencias?.prefResposta ?? 'não informado';
  const contexto = (profile?.contexto ?? []).join(', ') || 'não informado';
  const tecnologias = (profile?.tecnologias ?? []).join(', ') || 'não informado';

  return `Você transforma pedidos de usuários em prompts reutilizáveis e personalizados.
Use SOMENTE as informações de perfil abaixo que forem relevantes ao pedido do usuário.
Não force informações irrelevantes dentro do prompt gerado.

Perfil do usuário:
Profissão: ${profissao}
Área de atuação/estudo: ${area}
Nível de conhecimento: ${nivel}
Tecnologias/ferramentas: ${tecnologias}
Tom de resposta preferido: ${tom}
Formato de resposta preferido: ${prefResposta}
Contextos de uso de IA: ${contexto}

Responda SEMPRE em JSON válido, sem texto fora do JSON e sem cercas de código, no formato:
{
  "template": "texto do prompt com variáveis no formato {variavel}",
  "variaveis": { "variavel1": "valor usado", "variavel2": "valor usado" },
  "promptFinal": "texto do prompt já preenchido, sem nenhuma chave { }",
  "usadas": ["lista em português das informações do perfil que você realmente usou, ex: 'Área', 'Tom de resposta'"]
}`;
}

// Alguns modelos devolvem o JSON envolto em ```json ... ``` mesmo quando
// instruídos a não fazer isso — essa função limpa antes do JSON.parse.
function extractJson(raw) {
  return raw.replace(/```json/gi, '').replace(/```/g, '').trim();
}

async function callAI(systemPrompt, userMessage) {
  const response = await axios.post(
    `${AI_BASE_URL}/chat/completions`,
    {
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.6,
      max_tokens: 800,
    },
    { headers: { Authorization: `Bearer ${AI_API_KEY}` } }
  );

  return response.data.choices[0].message.content;
}

// ---------------------------------------------------------------------------
// Endpoint principal: gerar prompt personalizado
// body: { userMessage: string, profile: {...} }
// ---------------------------------------------------------------------------
app.post('/generate-prompt', requireAuth, async (req, res) => {
  const { userMessage, profile } = req.body;

  if (!userMessage) {
    return res.status(400).json({ error: 'userMessage é obrigatório' });
  }

  try {
    const systemPrompt = buildSystemPrompt(profile);
    const raw = await callAI(systemPrompt, userMessage);

    let parsed;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      // fallback: se o modelo não devolver JSON limpo, manda o texto puro
      parsed = { template: null, variaveis: null, promptFinal: raw, usadas: [] };
    }

    res.json(parsed);
  } catch (error) {
    console.error('Erro ao gerar prompt:', error.response?.data || error.message);
    res.status(500).json({ error: 'Não foi possível gerar o prompt' });
  }
});

// Endpoint simples de saúde, útil pra checar se o serviço free acordou
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
