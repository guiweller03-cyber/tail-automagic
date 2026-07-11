-- Migração: adiciona coluna venda_origem para vincular uma venda adicional à venda original
BEGIN;

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS venda_origem text;

COMMIT;
