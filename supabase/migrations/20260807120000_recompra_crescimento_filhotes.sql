alter table if exists public.recompra_previsoes
  add column if not exists aviso_recompra_enviado_em timestamptz;

comment on column public.clientes.pets_detalhes is
  'JSON array de pets. Campos suportados: nome, especie, castrado, raca, porte, pesoKg, pesoKgMedidoEm, idade, nascimento, dataNascimentoEstimada, idadeAdultaConfirmada, racaSlug, observacao.';

comment on column public.recompra_previsoes.aviso_recompra_enviado_em is
  'Timestamp do aviso antecipado de recompra enviado ao cliente; evita reenvio diario dentro da janela.';
