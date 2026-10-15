-- Plano no aplicativo, parte 2: conteúdo do plano (as seções da apresentação) e pendências com resposta do casal.
-- NÃO APLICADA. Revisar e executar em produção pelo chat de trabalho, DEPOIS da migration 20261009120000.
-- Aditiva: duas tabelas novas, uma coluna nova com padrão false e uma função. Nenhuma linha existente é alterada.
-- Rollback:
--   drop function public.plano_responder_pendencia(uuid, text);
--   drop table public.plano_pendencias, public.plano_conteudo;
--   alter table public.plano_config drop column realizado_visivel;
--
-- plano_conteudo guarda uma seção por linha (diagnostico, metodo, caixa, corte, dividas) em jsonb: números e textos que
-- o casal vê na tela. O código do aplicativo não contém nenhum valor do cliente; a Arsen grava pelo script scripts/plano.
-- plano_pendencias: lista de itens a decidir. O casal só consegue gravar a própria resposta (função abaixo); status e
-- texto das pendências são da Arsen.
-- realizado_visivel: enquanto for false, a tela do plano esconde "gastos reais contra o plano" (a Arsen liga quando as
-- transferências entre contas estiverem classificadas e o realizado refletir o consumo de fato).

begin;

alter table public.plano_config
  add column if not exists realizado_visivel boolean not null default false;

create table public.plano_conteudo (
  household_id  uuid not null references public.households(id) on delete cascade,
  secao         text not null check (secao in ('diagnostico','metodo','caixa','corte','dividas')),
  dados         jsonb not null check (jsonb_typeof(dados) = 'object'),
  atualizado_em timestamptz not null default now(),
  primary key (household_id, secao)
);

create table public.plano_pendencias (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  ordem          int not null default 0,
  titulo         text not null check (char_length(titulo) between 1 and 200),
  detalhe        text check (detalhe is null or char_length(detalhe) <= 2000),
  responsavel    text not null check (responsavel in ('casal','arsen')),
  status         text not null default 'aberta' check (status in ('aberta','em_analise','resolvida')),
  resposta       text check (resposta is null or char_length(resposta) <= 2000),
  respondido_por uuid references auth.users(id) on delete set null,
  respondido_em  timestamptz
);
create index plano_pendencias_household on public.plano_pendencias(household_id, ordem);

alter table public.plano_conteudo   enable row level security;
alter table public.plano_pendencias enable row level security;

create policy "ler conteudo do household" on public.plano_conteudo
  for select to authenticated using (household_id = my_household_id());
create policy "admin gerencia plano_conteudo" on public.plano_conteudo
  for all to authenticated using (is_arsen_admin()) with check (is_arsen_admin());

create policy "ler pendencias do household" on public.plano_pendencias
  for select to authenticated using (household_id = my_household_id());
create policy "admin gerencia plano_pendencias" on public.plano_pendencias
  for all to authenticated using (is_arsen_admin()) with check (is_arsen_admin());

-- O casal responde a uma pendência dirigida a ele. Só a resposta muda (mais o status, de aberta para em análise).
create or replace function public.plano_responder_pendencia(p_id uuid, p_resposta text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_resposta text := nullif(btrim(p_resposta), '');
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if v_resposta is not null and char_length(v_resposta) > 2000 then
    raise exception 'resposta longa demais (máximo 2000 caracteres)';
  end if;
  update public.plano_pendencias
     set resposta = v_resposta,
         respondido_por = auth.uid(),
         respondido_em = now(),
         status = case when status = 'aberta' and v_resposta is not null then 'em_analise' else status end
   where id = p_id
     and household_id = public.my_household_id()
     and responsavel = 'casal'
     and status <> 'resolvida';
  if not found then
    raise exception 'pendência não encontrada, já resolvida ou não é do casal';
  end if;
end;
$$;

revoke all on function public.plano_responder_pendencia(uuid, text) from public, anon;
grant execute on function public.plano_responder_pendencia(uuid, text) to authenticated;

commit;
