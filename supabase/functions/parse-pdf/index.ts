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

const anthropic   = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
  defaultHeaders: { "anthropic-workspace-id": "wrkspc_01KnNEWP1Gyi5qatKaNurHrz" },
});

// CORS em TODAS as respostas (inclusive erros). Sem isso o navegador
// esconde o erro real e o cliente só vê "Failed to fetch".
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Teto de saída. O formato compacto usa ~30 tokens por lançamento,
// então 12k tokens comportam ~350 lançamentos dentro do limite de tempo da Edge Function.
const MAX_TOKENS = 12000;

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
  { id: "c-tarifas",       nome: "Tarifas e juros bancários", classificacao: "necessidade", exemplos: "juros de cheque especial, IOF, tarifa bancária, anuidade, encargos" },
];

const SYSTEM_PROMPT = `Você é um assistente especializado em finanças pessoais brasileiras.
Sua tarefa é analisar extratos e faturas de cartão e extrair/categorizar transações com máxima precisão.

Regras:
1. Extraia TODOS os lançamentos de débito (despesas) e crédito (receitas), sem pular nenhum.
2. Ignore apenas saldo anterior, saldo final e totais. Inclua pagamentos de fatura, "pagamento recebido" e transferências entre contas: o aplicativo decide depois o que é transferência.
3. Limpe os nomes: "IFD*RESTAURANTE COZINH" → "Restaurante Cozinha". Remova códigos técnicos.
4. Datas: use o formato YYYY-MM-DD. Se só houver dia/mês, use o ano do documento.
5. Use as categorias fornecidas. Escolha a mais específica possível.
6. confianca: "a" = alta (certeza ≥ 90%), "m" = média (60-90%), "r" = revisar (< 60%).
7. Justificativa SOMENTE para itens "r", em no máximo 8 palavras. Para os demais, omita.
8. Retorne SOMENTE um JSON válido e compacto, sem markdown, sem explicação.`;

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
  prompt += `Analise o documento e retorne um JSON neste formato compacto:
{"f":"Nome do banco/cartão","p":["YYYY-MM-DD","YYYY-MM-DD"],"t":[
["YYYY-MM-DD","Descrição limpa",123.45,"d","c-restaurante","a"],
["YYYY-MM-DD","Descrição limpa",50.00,"r","c-reserva","r","justificativa curta"]
]}

Onde: f = fonte; p = período [início, fim]; t = lançamentos, cada um como
[data, descrição, valor positivo, "d" despesa | "r" receita, categoria_id, confiança, justificativa opcional].

Categorias disponíveis:
${CATEGORIES.map(c => `- ${c.id} | ${c.nome} (${c.classificacao}) — ${c.exemplos}`).join("\n")}`;
  return prompt;
}

const CONF: Record<string, "alta" | "media" | "revisar"> = { a: "alta", m: "media", r: "revisar" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });

  try {
    const body = await req.json() as {
      pdf_base64: string;
      media_type?: string;
      corrections?: { descricao: string; de: string; para: string }[];
      is_revalidation?: boolean;
    };

    if (!body.pdf_base64) return json({ error: "pdf_base64 obrigatório" }, 400);

    const started = Date.now();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: (body.media_type ?? "application/pdf") as "application/pdf", data: body.pdf_base64 } },
          { type: "text", text: buildUserPrompt(body.corrections ?? [], body.is_revalidation ?? false) },
        ],
      }],
    });

    const raw = response.content.map(b => b.type === "text" ? b.text : "").join("");
    console.log(JSON.stringify({
      stop_reason: response.stop_reason, usage: response.usage,
      ms: Date.now() - started, pdf_kb: Math.round(body.pdf_base64.length * 0.75 / 1024),
    }));

    if (response.stop_reason === "max_tokens") {
      return json({ error: `Documento longo demais: resposta cortada em ${MAX_TOKENS} tokens` }, 422);
    }

    let parsed: any;
    try {
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      parsed = JSON.parse(raw.slice(s, e + 1));
    } catch {
      // Não devolver o texto da resposta: pode conter descrições de lançamentos do cliente.
      console.error(JSON.stringify({ erro: "json_invalido", tamanho_resposta: raw.length }));
      return json({ error: "Resposta da IA não é um JSON válido" }, 502);
    }

    const transacoes = (parsed.t ?? []).map((r: any[]) => {
      const cat = CATEGORIES.find(c => c.id === r[4]);
      return {
        id:             crypto.randomUUID(),
        descricao:      String(r[1] ?? ""),
        data:           String(r[0] ?? new Date().toISOString().slice(0, 10)),
        valor:          Math.abs(Number(r[2] ?? 0)),
        tipo:           r[3] === "r" ? "receita" : "despesa",
        categoria_id:   cat ? cat.id : null,
        categoria_nome: cat ? cat.nome : null,
        confianca:      CONF[r[5]] ?? "revisar",
        justificativa:  r[6] ? String(r[6]) : "",
      };
    });

    const soma = (tipo: string) =>
      Math.round(transacoes.filter((t: any) => t.tipo === tipo).reduce((s: number, t: any) => s + t.valor, 0) * 100) / 100;

    return json({
      transacoes,
      periodo:        Array.isArray(parsed.p) ? { inicio: parsed.p[0], fim: parsed.p[1] } : null,
      total_despesas: soma("despesa"),
      total_receitas: soma("receita"),
      fonte:          parsed.f ?? "Desconhecido",
      tokens_usados:  response.usage,
    });

  } catch (err: any) {
    console.error("parse-pdf erro:", err?.message ?? err);
    return json({ error: err?.message ?? "Erro interno" }, 500);
  }
});
