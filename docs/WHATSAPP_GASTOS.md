# Gastos pelo WhatsApp (Z-API)

O cliente manda uma mensagem para o WhatsApp da Arsen — texto (`mercado 85,90`), áudio ou foto de cupom —, o app
responde com o que entendeu e **só grava depois do "sim"**. Funciona apenas para números vinculados a uma conta.

## Como funciona

1. **Vínculo.** Em *Perfil → Gastos pelo WhatsApp*, o cliente informa o celular e recebe um código de 6 dígitos
   (vale 15 min). Ele envia `codigo 123456` **do próprio celular** para o número da Arsen. Isso prova que é dono da conta
   (gerou o código logado) e do número (a mensagem veio dele). Até 5 tentativas por código.
2. **Lançamento.** Mensagem → interpretação → resposta com descrição, valor, data e categoria → `sim` grava,
   `não` descarta. O rascunho expira em 30 min. `desfazer` apaga o último lançamento das últimas 24 h. `ajuda` mostra exemplos.
3. **Gravação.** O lançamento entra em `transactions` com `origem = 'whatsapp'`, `status = 'confirmada'`, no usuário e
   household **do vínculo** (nunca de algo escrito na mensagem). Receita entra sem categoria; transferências e faturas não
   são aceitas por aqui (o bot orienta a importar pelo app).

| Entrada | Como é lida | Observações |
|---|---|---|
| Texto | Regras locais (valor, data, palavras-chave); IA só para a categoria quando a palavra-chave não basta | Mais barato e confiável |
| Foto | Se a legenda tiver valor, usa a legenda; senão a IA (Anthropic) lê o **total** do cupom | Resposta pede para conferir o valor |
| Áudio | Transcrição na OpenAI (Whisper) e depois a mesma leitura do texto | **Desligado** enquanto não houver `OPENAI_API_KEY` |

## Arquivos

- `supabase/functions/_shared/whatsapp-core.ts` — regras puras (telefone, valor, data, categoria, validação, respostas,
  formato da Z-API, anti-SSRF). Testes em `whatsapp-core.test.ts` (`npm test`).
- `supabase/functions/whatsapp-webhook/index.ts` — recebe o evento da Z-API, aplica as regras, responde.
- `supabase/migrations/20261120120000_whatsapp_gastos.sql` — vínculos, mensagens (idempotência), rascunhos e RPCs.
- `src/components/WhatsAppCard.tsx` — tela de vínculo no Perfil.

## Segurança e privacidade

- **Webhook autenticado** por segredo (`?token=` ou cabeçalho `x-webhook-token`, comparação em tempo constante) e pelo
  `instanceId` da sua instância. Sem segredo válido: 401.
- **Idempotência:** cada `messageId` é processado uma vez (a Z-API pode reenviar).
- **Limite:** 30 mensagens por número por hora. Números não vinculados recebem no máximo um aviso por dia.
- **Isolamento:** RPCs com escopo explícito; tabelas do WhatsApp sem acesso pelo app (RLS sem policy); funções do
  webhook só para `service_role`. O hash do código de vínculo nunca sai do banco.
- **Mídia:** só HTTPS, só hosts listados em `ZAPI_MEDIA_HOSTS`, sem redirecionamento, tipo e tamanho limitados
  (foto 5 MB; áudio 10 MB e 60 s).
- **Conteúdo não é guardado** nem vai para log (só id, tipo e situação; telefone mascarado).
- **IA:** a mensagem é tratada como dado; a resposta da IA só preenche campos validados (valor, data, categoria da lista).
- **Terceiros:** texto e fotos vão para a Anthropic; áudios iriam para a OpenAI. Isso precisa constar no aviso de
  privacidade antes de ligar o áudio.
- **Z-API é não oficial** (WhatsApp Web): há risco de bloqueio do número. Use um número dedicado à Arsen, não o pessoal.

## Publicação (ordem obrigatória)

Nada disso foi aplicado nem publicado.

1. **Backup** (SQL Editor): `transactions`, como nos passos anteriores.
2. **Migração:** rodar `20261120120000_whatsapp_gastos.sql` no SQL Editor. Verificação:

```sql
select proname, has_function_privilege('anon', oid, 'execute') as anon,
       has_function_privilege('authenticated', oid, 'execute') as app
from pg_proc where proname like 'whatsapp_%' order by 1;
-- anon = false em todas; app = true só em iniciar_vinculo, meu_vinculo e revogar
```

3. **Secrets** da função (Supabase → Edge Functions → Secrets, ou `npx supabase@latest secrets set ...` no seu terminal):
   - `WHATSAPP_WEBHOOK_SECRET` — aleatório, 32+ caracteres (ex.: `openssl rand -hex 32`).
   - `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` — do painel da Z-API.
   - `ZAPI_MEDIA_HOSTS` — hosts de onde a Z-API entrega mídia. Confirme olhando a URL de uma imagem recebida no seu
     número (ex.: `backblazeb2.com`). Vazio = foto e áudio desligados (texto funciona).
   - `OPENAI_API_KEY` — só se for ligar áudio.
4. **Publicar a função:** `npx supabase@latest functions deploy whatsapp-webhook --no-verify-jwt`
5. **Z-API:** em *Webhooks → Ao receber*, colocar
   `https://biipfchogxyzenyebtby.supabase.co/functions/v1/whatsapp-webhook?token=<WHATSAPP_WEBHOOK_SECRET>`.
   Deixe desmarcado o envio de mensagens enviadas por você.
6. **Front:** criar o secret `VITE_WHATSAPP_NUMERO` no GitHub (Settings → Secrets → Actions) com o número da Arsen
   (só dígitos, ex.: `5511999999999`) e mesclar o PR.

## Teste de fumaça (com o seu próprio número, nunca o de um cliente)

1. Perfil → gerar código → enviar `codigo NNNNNN` → resposta "seu WhatsApp está vinculado".
2. `mercado 85,90` → confirmação com Alimentação → `sim` → aparece no painel com a data de hoje.
3. `desfazer` → some do painel.
4. `uber 99 15` → pede um valor só. `transferi 500` → orienta a importar pelo app.
5. Foto de um cupom → confira o total lido → `não` → nada gravado.
6. De outro número não vinculado: só um aviso por dia.

**Antes de ligar:** confirme o formato do payload real da Z-API. O parser segue a documentação (`ReceivedCallback`,
`text.message`, `image.imageUrl`, `audio.audioUrl`), mas não foi testado contra uma mensagem real.
