// supabase/functions/parse-pdf/index.ts
// Deploy: supabase functions deploy parse-pdf --no-verify-jwt
// Secrets necessários:
//   ANTHROPIC_API_KEY  → sua chave da Anthropic (https://console.anthropic.com)
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → automáticos
//
// Este endpoint:
//   1. Recebe o PDF em base64 + correções anteriores do usuário
//   2. Envia ao Claude com contexto de categorias brasileiras
//   3. Retorna transações estruturadas com categoria, confiança e justificativa
//   4. Se "revalidar" é enviado com correções, Claude aprende e ajusta

import Anthropic from "npm:@anthropic-ai/sdk@0.30.1";
import { createClient } from "jsr:@supabase/supabase-js@2";

const anthropic   = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Categorias disponíveis (espelha a tabela categories do banco)
const CATEGORIES = [
  { id: "c-moradia",       nome: "Moradia",                classificacao: "necessidade", exemplos: "aluguel, condomínio, IPTU, água, luz, gás, internet, reforma" },
  { id: "c-alimentacao",   nome: "Alimentação",            classificacao: "necessidade", exemplos: "supermercado, açougue, hortifrúti, padaria, delivery básico" },
  { id: "c-transporte",    nome: "Transporte",             classificacao: "necessidade", exemplos: "gasolina, Uber, 99, ônibus, metrô, estacionamento, IPVA, revisão" },
  { id: "c-saude",         nome: "Saúde",                  classificacao: "necessidade", exemplos: "farmácia, plano de saúde, médico, exame, academia" },
  { id: "c-educacao",      nome: "Educação",               classificacao: "necessidade", exemplos: "escola, faculdade, curso, livro, material escolar" },
  { id: "c-contas",        nome: "Contas de consumo",      classificacao: "necessidade", exemplos: "telefone, streaming básico, assinatura essencial" },
  { id: "c-restaurante",   nome: "Restaurantes e bares",   classificacao: "desejo",      exemplos: "restaurante, lanchonete, bar, café, iFood, Rappi, delivery" },
  { id: "c-lazer",         nome: "Lazer e entretenimento", classificacao: "desejo",      exemplos: "cinema, show, viagem, hotel, parque, Netflix, Spotify, jogo" },
  { id: "c-compras",       nome: "Compras e vestuário",    classificacao: "desejo",      exemplos: "roupa, calçado, eletrônico, Amazon, Mercado Livre, loja" },
  { id: "c-viagem",        nome: "Viagens",                classificacao: "desejo",      exemplos: "passagem aérea, Airbnb, hotel, hospedagem, pacote turístico" },
  { id: "c-assinaturas",   nome: "Assinaturas",            classificacao: "desejo",      exemplos: "Netflix, Spotify, Disney+, Apple, Google, assinatura digital" },
  { id: "c-reserva",       nome: "Reserva de emergência",  classificacao: "poupanca",   exemplos: "CDB, poupança, fundo de emergência" },
  { id: "c-investimentos", nome: "Investimentos",          classificacao: "poupanca",   exemplos: "ações, fundos, tesouro direto, criptomoeda, aporte" },
  { id: "c-previdencia",   nome: "Previdência",            classificacao: "poupanca",   exemplos: "PGBL, VGBL, previdência privada, INSS" },
];

const SYSTEM_PROMPT = `Você é um assistente especializado em finanças pessoais brasileiras.
Sua tarefa é analisar extratos e faturas de cartão e extrair/categorizar transações com máxima precisão.

Regras:
1. Extraia APENAS lançamentos de débito (despesas) e crédito (receitas/pagamentos).
2. Ignore lançamentos de pagamento de fatura, saldo anterior, encargos genéricos do banco.
3. Limpe os nomes: "IFD*RESTAURANTE COZINH" → "Restaurante Cozinha". Remova códigos técnicos.
4. Datas: use o formato YYYY-MM-DD. Se só houver mês, use o ano do extrato.
5. Use as categorias fornecidas. Escolha a mais específica possível.
6. confianca:
   - "alta": certeza ≥ 90% (nome claro, correspondência óbvia)
   - "media": certeza 60-90% (nome ambíguo mas contexto ajuda)
   - "revisar": certeza < 60% (nome desconhecido, código incompreensível)
7. Retorne SOMENTE um JSON válido, sem markdown, sem explicação.`;

function buildUserPrompt(
  corrections: { descricao: string; de: string; para: string }[],
  isRevalidation: boolean
): string {
  let prompt = "";
  if (isRevalidation && corrections.length > 0) {
    prompt += `O usuário fez as seguintes correções de categoria:\n`;
    corrections.forEach(c => {
      prompt += `- "${c.descricao}": de "${c.de}" → para "${c.para}"\n`;
    });
    prompt += `\nLeve essas correções em consideração ao recategorizar transações similares no documento.\n\n`;
  }
  prompt += `Analise o documento e retorne um JSON com este formato exato:
{
  "transacoes": [
    {
      "descricao": "Nome limpo da transação",
      "data": "YYYY-MM-DD",
      "valor": 123.45,
      "tipo": "despesa",
      "categoria_id": "c-restaurante",
      "categoria_nome": "Restaurantes e bares",
      "confianca": "alta",
      "justificativa": "Prefixo IFD* indica iFood, serviço de entrega de alimentação"
    }
  ],
  "periodo": { "inicio": "YYYY-MM-DD", "fim": "YYYY-MM-DD" },
  "total_despesas": 1234.56,
  "total_receitas": 0,
  "fonte": "Nubank" 
}

Categorias disponíveis:
${CATEGORIES.map(c => `- ${c.id} | ${c.nome} (${c.classificacao}) — ${c.exemplos}`).join("\n")}`;
  return prompt;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const body = await req.json() as {
      pdf_base64: string;
      media_type?: string;
      corrections?: { descricao: string; de: string; para: string }[];
      is_revalidation?: boolean;
    };

    if (!body.pdf_base64) {
      return new Response(JSON.stringify({ error: "pdf_base64 obrigatório" }), { status: 400 });
    }

    const userPrompt = buildUserPrompt(
      body.corrections ?? [],
      body.is_revalidation ?? false
    );

    // Chama Claude com o PDF como documento nativo
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: (body.media_type ?? "application/pdf") as "application/pdf",
                data: body.pdf_base64,
              },
            },
            {
              type: "text",
              text: userPrompt,
            },
          ],
        },
      ],
    });

    // Extrai o JSON da resposta
    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    let parsed: any;
    try {
      // Remove possíveis blocos markdown
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({
        error: "Claude retornou resposta inválida",
        raw: raw.slice(0, 500),
      }), { status: 500 });
    }

    // Valida e normaliza as transações
    const transacoes = (parsed.transacoes ?? []).map((t: any, i: number) => ({
      id:            crypto.randomUUID(),
      descricao:     String(t.descricao ?? ""),
      data:          String(t.data ?? new Date().toISOString().slice(0, 10)),
      valor:         Math.abs(Number(t.valor ?? 0)),
      tipo:          t.tipo === "receita" ? "receita" : "despesa",
      categoria_id:  CATEGORIES.find(c => c.id === t.categoria_id) ? t.categoria_id : null,
      categoria_nome: t.categoria_nome ?? null,
      confianca:     ["alta", "media", "revisar"].includes(t.confianca) ? t.confianca : "revisar",
      justificativa: t.justificativa ?? "",
    }));

    return new Response(JSON.stringify({
      transacoes,
      periodo:        parsed.periodo ?? null,
      total_despesas: parsed.total_despesas ?? 0,
      total_receitas: parsed.total_receitas ?? 0,
      fonte:          parsed.fonte ?? "Desconhecido",
      tokens_usados:  response.usage,
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Erro interno" }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
});
