# Especificação técnica: cálculo de recompra ajustado ao crescimento do filhote

## Resumo das duas mudanças pedidas

1. **Peso dinâmico por raça+idade** (em vez de peso estático) — corrige a estimativa de `dias` até a ração acabar, que hoje fica cada vez mais errada conforme o filhote cresce.
2. **Aviso antecipado**: o alerta de recompra deve chegar **antes** do dia em que a ração é estimada acabar, não no dia exato — pra não correr o risco do cliente ficar sem ração e comprar em outro lugar antes da loja avisar. A antecedência varia por porte (pets pequenos usam pacotes menores, que acabam mais rápido e dão menos margem de reação):

| Porte | Dias de antecedência |
|---|---|
| toy | 3 |
| pequeno | 3 |
| medio | 5 |
| grande | 5 |
| gigante | 5 |

## Problema atual

O CRM já guarda peso por pet em `clientes[].petsDetalhes[]`, mas é um valor **estático**, sem data de referência. Exemplos reais tirados do próprio banco (`GET /api/crm/clientes`):

```json
{ "nome": "Kyra", "raca": "Pastor Belga", "porte": "medio", "pesoKg": 25 }
{ "nome": "Rosinha", "raca": "shih tzu", "porte": "pequeno", "pesoKg": 4.5 }
{ "nome": "Lilica", "raca": "shih tzu", "porte": "pequeno", "observacao": "Filhote" }  // sem pesoKg
```

Dois problemas:

1. **Filhotes sem peso** (como a Lilica) não entram no cálculo de `recompra_auto` com precisão nenhuma — não há como estimar `consumo_diario_g`.
2. **Peso desatualizado**: se o `pesoKg` da Kyra (Pastor Belga) foi digitado quando ela tinha 4 meses, esse número não muda sozinho. Um Pastor Belga cresce de ~30% para ~100% do peso adulto entre 4 e 12 meses — ou seja, o consumo diário real dela hoje pode ser o dobro do que o sistema assume, e a recompra prevista (`dias` em `recompra_auto sku="..." dias=X`) vai estar sistematicamente atrasada pra filhotes em crescimento.

## Solução proposta

Trocar peso estático por peso **calculado dinamicamente** a partir de raça + idade, usando uma curva de crescimento com base científica (ver seção "Fontes").

### 1. Schema — campos novos em `petsDetalhes[]`

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `dataNascimentoEstimada` | `date` (ISO) | Se pet ainda não é adulto | Data de nascimento, exata ou estimada (ex.: tutor disse "tem 3 meses" → hoje − 3 meses). |
| `idadeAdultaConfirmada` | `boolean` | Não | `true` quando o pet já atingiu peso adulto (evita recalcular pra sempre; ex.: pets com >24 meses). |
| `racaSlug` | `string` | Recomendado | Chave normalizada pra bater com a tabela `racas_peso_adulto.csv` (ver abaixo). Se `raca` não bater com nenhuma raça conhecida, cair no fallback por `porte`. |

`pesoKg` deixa de ser a fonte da verdade pra pets em crescimento — passa a ser um **valor calculado e cacheado** (recalculado quando o pet for exibido/usado em algum cálculo), não mais editado manualmente.

### 2. Tabelas de referência (anexadas a este documento)

- **`curva_crescimento_pct.csv`** — `porte, idade_meses, pct_peso_adulto`. Uma linha por combinação porte×idade (0 a 24 meses). Fonte: Salt et al. (2017), *"Growth standard charts for monitoring bodyweight in dogs of different sizes"*, PLOS ONE 12(9):e0182064 — estudo com >6 milhões de registros veterinários reais (Banfield/WALTHAM). DOI: 10.1371/journal.pone.0182064.
- **`racas_peso_adulto.csv`** — `raca, porte_slug, peso_adulto_min_kg, peso_adulto_max_kg, peso_adulto_medio_kg`. 67 raças. Fonte: AKC Official Breed Weight Chart + CBKC (Fila Brasileiro, Buldogue Campeiro) + UKC (Pit Bull) + padrões internacionais (Kangal).

Ambas devem virar tabelas normais no banco (ou um JSON estático versionado no código, já que mudam raramente).

### 3. Algoritmo

```
function pesoAtualKg(pet, hoje):
    if pet.idadeAdultaConfirmada or pet.dataNascimentoEstimada is null:
        return pet.pesoKg  # comportamento atual, sem mudança

    idadeMeses = mesesEntre(pet.dataNascimentoEstimada, hoje)

    if idadeMeses >= 24:
        pet.idadeAdultaConfirmada = true   # já adulto, trava o valor
        return pesoAdultoKg(pet)

    porte = pet.porte or portePorRaca(pet.racaSlug)   # fallback se porte não veio
    pesoAdulto = pesoAdultoKg(pet)                      # busca em racas_peso_adulto.csv, senão usa média do porte
    pct = interpolarCurva(porte, idadeMeses)            # interpola linearmente entre os pontos do CSV
    return round(pesoAdulto * pct, 2)

function pesoAdultoKg(pet):
    if pet.racaSlug in RACAS_PESO_ADULTO:
        return RACAS_PESO_ADULTO[pet.racaSlug].peso_adulto_medio_kg
    return PESO_MEDIO_POR_PORTE[pet.porte]   # fallback pra SRD/vira-lata ou raça não catalogada
                                              # (média das raças de cada porte em racas_peso_adulto.csv):
                                              # toy≈3.7kg, pequeno≈8.1kg, medio≈17.6kg, grande≈29.9kg, gigante≈57.1kg
```

`interpolarCurva` faz interpolação linear entre os dois pontos de idade mais próximos no CSV (ele já cobre 0,1,2,3,4,5,6,7,8,9,10,12,18,24 meses — suficiente pra qualquer idade em dias sem precisar reamostrar).

### 4. Onde plugar

- **Toda vez que `recompra_auto` for (re)gerado** (hoje isso parece rodar a partir da leitura das conversas/pedidos — mesmo texto `recompra_auto sku="..." dias=X consumo_diario_g=Y peso_kg=Z`), trocar `peso_kg=Z` fixo por `peso_kg=pesoAtualKg(pet, dataDoEvento)`.
- **Job noturno (novo)**: para todo pet com `idadeAdultaConfirmada=false`, recalcular `pesoAtualKg` e, se mudou o suficiente para alterar `consumo_diario_g` de forma relevante (ex.: >10%), recalcular `proxRecompra` do cliente — **mesmo sem pedido novo**. Esse é o ganho real: hoje a recompra só se ajusta quando entra um pedido; com isso ela se ajusta sozinha conforme o filhote cresce, então o alerta de recompra chega mais cedo e mais certo pros clientes com filhote.
- **Tela de cadastro de pet**: ao marcar "Filhote" (como no caso da Lilica), pedir `dataNascimentoEstimada` (pode ser aproximada, ex. "há 3 meses") em vez de só um texto livre em `observacao`.

### 5. Antecedência do aviso (novo)

Hoje (pelo padrão observado em `observacao`), o pedido guarda `recompra_auto sku="..." dias=X ...`, e o `dias` conta quantos dias a ração dura a partir da compra — ou seja, `recompraPrevista = dataCompra + dias`. O aviso pra recomprar deve disparar **antes** desse dia, não nele:

```
DIAS_ANTECEDENCIA_AVISO = {              # configurável — pode virar setting da loja, não precisa ser fixo no código
    "toy": 3,
    "pequeno": 3,
    "medio": 5,
    "grande": 5,
    "gigante": 5,
}

recompraPrevista = dataCompra + dias(pesoAtualKg)
dataAvisoRecompra = recompraPrevista - DIAS_ANTECEDENCIA_AVISO[pet.porte]

# no job noturno (ou a cada leitura do dashboard):
if hoje >= dataAvisoRecompra and hoje < recompraPrevista and aviso_ainda_nao_enviado:
    disparar_mensagem_whatsapp(cliente, pet, produto)
    marcar_aviso_enviado(pedido)
```

Dois detalhes importantes:

- **`dias` recalcula por causa do peso dinâmico** (seção 3), então `recompraPrevista` e `dataAvisoRecompra` também precisam recalcular junto no job noturno — não só uma vez na hora da compra. Um filhote que "deveria" durar 40 dias com o peso de quando comprou pode passar a durar 28 dias reais depois de um mês de crescimento; sem recalcular, a antecedência do aviso seria contada em cima do número errado e chegaria tarde do mesmo jeito.
- **Não reenviar** o mesmo aviso todo dia dentro da janela — controlar com um campo tipo `avisoRecompraEnviadoEm` no pedido/cliente, senão o cliente recebe a mesma mensagem repetida por 4 dias seguidos.

### 6. Casos de borda

- **Raça não catalogada / SRD (vira-lata)**: usar fallback por `porte` (peso médio da categoria). Se `porte` também não veio, não dá pra calcular — manter comportamento atual (peso fixo ou ausente).
- **Peso manual mais recente que a curva sugere**: se o lojista pesou o pet fisicamente (ex. na entrega), esse valor deveria sobrescrever o calculado até a próxima atualização — vale guardar `pesoKgMedidoEm` (data) e usar o medido enquanto for mais recente que `dataNascimentoEstimada + curva`.
- **Fêmea vs macho**: a curva usada é agregada (não separa sexo); fêmeas tendem a completar o crescimento um pouco antes e ficam ~5-10% mais leves no adulto. Não implementado aqui por falta de campo `sexo` no schema atual — pode ser adicionado depois se fizer diferença prática.

## Arquivos anexados

- `curva_crescimento_pct.csv`
- `racas_peso_adulto.csv`
- `racas_curva_crescimento.xlsx` (mesma informação em planilha, pra conferência humana)
