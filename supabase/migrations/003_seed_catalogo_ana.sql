insert into produtos (sku, nome, categoria, estoque, minimo, giro, preco, preco_compra, tipo, fornecedor)
values
  ('RC-AD-CAE-MED-15', 'Royal Canin Adulto Cães Médios 15kg', 'Rações', 8, 3, 'alto', 189.90, 135.00, 'próprio', 'Royal Canin'),
  ('RC-FIL-3', 'Royal Canin Filhote 3kg', 'Rações', 10, 4, 'médio', 79.90, 52.00, 'próprio', 'Royal Canin'),
  ('GOLD-AD-CAE-GRD-15', 'Golden Adulto Cães Grandes 15kg', 'Rações', 12, 4, 'alto', 129.90, 88.00, 'próprio', 'Premier Pet'),
  ('GOLD-GAT-AD-3', 'Golden Gatos Adulto 3kg', 'Rações', 10, 4, 'alto', 59.90, 38.00, 'próprio', 'Premier Pet'),
  ('WHISK-GAT-AD-3', 'Whiskas Gatos Adulto 3kg', 'Rações', 10, 4, 'alto', 54.90, 35.00, 'próprio', 'Whiskas'),
  ('BRAV-CAE-10-20', 'Bravecto Cães 10-20kg', 'Medicamentos e Saúde', 6, 2, 'médio', 189.90, 145.00, 'próprio', 'MSD'),
  ('BRAV-CAE-20-40', 'Bravecto Cães 20-40kg', 'Medicamentos e Saúde', 6, 2, 'médio', 219.90, 168.00, 'próprio', 'MSD'),
  ('DRON-CAE-4', 'Drontal Vermífugo Cães 4 comprimidos', 'Medicamentos e Saúde', 8, 3, 'médio', 48.90, 29.00, 'próprio', 'Elanco'),
  ('DRON-GAT-2', 'Drontal Vermífugo Gatos 2 comprimidos', 'Medicamentos e Saúde', 8, 3, 'médio', 39.90, 24.00, 'próprio', 'Elanco'),
  ('FRONT-SPR-250', 'Frontline Spray 250ml', 'Medicamentos e Saúde', 5, 2, 'médio', 89.90, 58.00, 'próprio', 'Frontline'),
  ('COL-PM', 'Coleira regulável P/M', 'Acessórios', 15, 5, 'baixo', 24.90, 12.00, 'próprio', 'Mundo Pet'),
  ('COL-GG', 'Coleira regulável G/GG', 'Acessórios', 15, 5, 'baixo', 29.90, 15.00, 'próprio', 'Mundo Pet'),
  ('COM-INOX-DUP', 'Comedouro inox duplo', 'Acessórios', 10, 3, 'baixo', 34.90, 18.00, 'próprio', 'Mundo Pet'),
  ('CAMA-PET-M', 'Cama pet tamanho M', 'Acessórios', 5, 2, 'baixo', 69.90, 38.00, 'próprio', 'Mundo Pet'),
  ('BRINQ-MORD', 'Brinquedo mordedor', 'Acessórios', 20, 5, 'baixo', 19.90, 8.00, 'próprio', 'Mundo Pet')
on conflict (sku) do update set
  nome = excluded.nome,
  categoria = excluded.categoria,
  minimo = excluded.minimo,
  giro = excluded.giro,
  preco = excluded.preco,
  preco_compra = excluded.preco_compra,
  tipo = excluded.tipo,
  fornecedor = excluded.fornecedor,
  atualizado_em = now();
