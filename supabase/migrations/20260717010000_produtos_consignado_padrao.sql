alter table produtos
  alter column tipo set default 'consignado';

update produtos
set tipo = 'consignado',
    atualizado_em = now()
where tipo is distinct from 'consignado';
