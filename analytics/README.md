# Sinaliza · Analytics (Databricks)

Lakehouse com as ocorrências do Sinaliza, em **Databricks Free Edition** com **Unity Catalog** e
tabelas **Delta** organizadas em camadas (_medallion_). Alimenta o dashboard do backoffice quando
`ANALYTICS_SOURCE=databricks`; sem Databricks, o backoffice usa as vistas SQL da `occurrence_db`
(`ANALYTICS_SOURCE=postgres`, por omissão).

```
occurrence_db ┐                         Databricks (catálogo sinaliza)
municipal_db  ┴─ export ─ Parquet ─▶ volume bronze.landing
                                        │ 01 Auto Loader
gerador ─ Parquet ─────────────────────▶│
                                        ▼
                                  bronze.*  ─ 02 MERGE + qualidade ─▶ silver.*
                                                                        │ 03
                                                                        ▼
            occurrence-service ◀─ SQL Statement Execution API ─── gold.* (indicadores)
```

| Pasta            | O que é                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `generator/`     | ~20 000 ocorrências sintéticas em Barcelos desde 2024 (`sinaliza-generate`)                                      |
| `export/`        | export incremental da `occurrence_db` e da `municipal_db` para Parquet e envio para o volume (`sinaliza-export`) |
| `common/`        | configuração e formato dos ficheiros do lake, partilhados pelos dois                                             |
| `notebooks/`     | `00`–`05`, em formato fonte (`.py`) com células `%md` e `%sql`                                                   |
| `databricks.yml` | Asset Bundle: notebooks + job diário `01 → 02 → 03`                                                              |
| `tests/`         | testes do gerador, do export, do formato dos notebooks e do bundle                                               |

## Dados pessoais

O lake **nunca** recebe o nome, o email nem a descrição escrita pelo cidadão: o export só lê o
`citizen_id` (um UUID, pseudónimo) e os campos necessários aos indicadores. A camada gold só tem
agregados, e é a única que o grupo de leitores (e o token do `occurrence-service`) pode ler.

## Passo a passo

### 1. Ferramentas locais

- [uv](https://docs.astral.sh/uv/) (instala o Python 3.11 sozinho);
- a stack a correr (`docker compose up -d` na raiz) para o `--load-postgres` e o export;
- a [Databricks CLI](https://docs.databricks.com/aws/en/dev-tools/cli/install) para o bundle.

```bash
cd analytics
uv sync
```

### 2. Conta Databricks Free Edition

1. Crie a conta em <https://www.databricks.com/learn/free-edition> (gratuita).
2. **Token:** no workspace, _Settings → Developer → Access tokens → Generate new token_
   ([documentação](https://docs.databricks.com/aws/en/dev-tools/auth/pat)). Dê-lhe uma validade
   curta (por exemplo 90 dias).
3. **SQL warehouse:** _SQL Warehouses_ → o _Serverless Starter Warehouse_ (na Free Edition há um,
   2X-Small) → _Connection details_. O **id** é o último segmento do _HTTP path_
   (`/sql/1.0/warehouses/<id>`).
4. Na raiz do repositório, no `.env` (nunca no Git):

   ```bash
   DATABRICKS_HOST=https://dbc-xxxxxxxx-xxxx.cloud.databricks.com
   DATABRICKS_TOKEN=dapi...
   DATABRICKS_WAREHOUSE_ID=xxxxxxxxxxxxxxxx
   ```

A CLI lê as mesmas variáveis (`DATABRICKS_HOST` e `DATABRICKS_TOKEN`).

### 3. Dados sintéticos

```bash
uv run sinaliza-generate                      # só Parquet em output/generated/
uv run sinaliza-generate --load-postgres      # + insere na occurrence_db (stack a correr)
uv run sinaliza-generate --load-postgres --replace   # volta a gerar, substituindo os anteriores
uv run sinaliza-generate --purge              # apaga da occurrence_db as ocorrências geradas
```

Opções: `--count` (20 000), `--start` (2024-01-01), `--seed` (42, o mesmo _seed_ dá os mesmos
dados), `--upload` (envia os Parquet diretamente para o volume, sem passar pelo Postgres).

O que o gerador simula:

- pontos dentro do polígono de Barcelos (`infra/geo/barcelos.geojson`), com focos no centro,
  em Barcelinhos, na feira de quinta-feira e em duas zonas industriais;
- sazonalidade: iluminação mais no inverno; resíduos mais no verão e às quintas (feira); vias
  depois de dias de chuva (série de chuva simulada, mais húmida no outono e inverno);
- percursos pela máquina de estados real, com ações do gestor em horário de expediente e prazos
  por categoria (iluminação 3–10 dias, vias 7–30, resíduos 1–5…), ~8 % rejeitadas, ~5 %
  duplicadas (de uma ocorrência próxima e recente) e ~2 % anuladas; 4 % «empancam» e demoram o triplo.

Os cidadãos gerados usam o domínio reservado `gerado.sinaliza.test` — é por ele que `--purge` e
`--replace` os encontram. O `--load-postgres` corre numa transação: atribui referências
`SIN-AAAA-NNNNN` a seguir às existentes, verifica que todos os pontos estão dentro do limite em
cache e só então confirma. Não publica eventos, por isso não envia emails.

### 4. Catálogo e volume (uma vez)

```bash
databricks bundle deploy          # envia os notebooks e cria o job (target dev)
```

No workspace, abra `.bundle/sinaliza-analytics/dev/files/notebooks/00_setup` e corra-o: cria o
catálogo `sinaliza`, os esquemas `bronze`/`silver`/`gold`, os volumes `bronze.landing` e
`bronze.checkpoints`, as pastas de chegada e as permissões de leitura da gold.

### 5. Export para o volume

```bash
uv run sinaliza-export             # incremental: só o que mudou desde a última vez
uv run sinaliza-export --full      # tudo outra vez (a silver deduplica)
uv run sinaliza-export --no-upload # só os Parquet em output/export/, sem Databricks
```

Cada execução escreve `output/export/<tabela>/<tabela>-<data>.parquet` e envia-os para
`/Volumes/sinaliza/bronze/landing/<tabela>/`. As marcas d'água (o maior `updated_at` de cada
tabela) ficam em `output/export/state.json` e só avançam depois de o envio correr bem.

### 6. Job diário

```bash
databricks bundle validate
databricks bundle run lakehouse_diario        # corre já: bronze → silver → gold
databricks bundle deploy -t prod              # agenda às 05:30 (Europe/Lisbon)
```

No target `dev` (por omissão) a Databricks pausa o agendamento e prefixa o nome do job com
`[dev …]`; o `prod` deixa-o ativo. As tarefas correm em computação serverless.

Os notebooks `04_otimizacao_e_governanca` (Liquid Clustering, OPTIMIZE, VACUUM, Time Travel,
_tags_) e `05_consultas_dashboard` (as consultas do backoffice e _datasets_ para um dashboard
AI/BI) correm-se à mão.

### 7. Ligar o backoffice ao Databricks

No `.env`:

```bash
ANALYTICS_SOURCE=databricks
```

e reinicie o serviço: `docker compose up -d occurrence-service`. O dashboard passa a mostrar
«Databricks · atualizado a …» (a hora em que a gold foi calculada). As respostas ficam em cache
10 minutos por período (`ANALYTICS_CACHE_SECONDS`). Se o Databricks falhar, a API responde 502
com uma mensagem em português; volte a `postgres` para usar a base operacional.

O warehouse da Free Edition desliga-se quando está parado: o primeiro pedido depois disso pode
demorar alguns segundos a mais.

## Limites da Free Edition a ter em conta

- só computação serverless e um SQL warehouse 2X-Small;
- até 5 tarefas de jobs em simultâneo (o job usa 1 de cada vez);
- quotas diárias: ao ultrapassá-las, a computação pára até ao dia seguinte (os dados ficam).

## Qualidade

```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy
uv run pytest
```

Os notebooks só correm no Databricks; os testes verificam o formato (cabeçalho, células), que o
Python compila, que o SQL é válido no dialeto Databricks (`sqlglot`), o grafo de tarefas do bundle
e que as consultas do `occurrence-service` são as mesmas do notebook 05.
