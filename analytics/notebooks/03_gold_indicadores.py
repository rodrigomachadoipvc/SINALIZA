# Databricks notebook source
# MAGIC %md
# MAGIC # 03 · Gold: indicadores
# MAGIC
# MAGIC Tabelas agregadas, prontas a consultar pelo backoffice (através da SQL Statement Execution API)
# MAGIC e pelo dashboard. As **ocorrências anuladas** pelo cidadão ficam de fora dos indicadores, como
# MAGIC na vista `occurrence_facts` da base operacional — exceto em `gold.taxas`, que as conta à parte.
# MAGIC
# MAGIC | Tabela | Grão | Para quê |
# MAGIC | --- | --- | --- |
# MAGIC | `kpi_diario` | dia × categoria × estado | totais, estados, categorias e tendência do backoffice |
# MAGIC | `tempo_resolucao` | mês × categoria | média, mediana e p90 dos dias até resolver |
# MAGIC | `hotspots_h3` | dia × categoria × célula H3 | mapa de calor |
# MAGIC | `tendencia_mensal` | mês | criadas, resolvidas, média móvel e variação homóloga |
# MAGIC | `taxas` | mês × categoria | rejeição, duplicação e anulação |
# MAGIC | `backlog` | dia | ocorrências em curso no fim de cada dia |
# MAGIC
# MAGIC Recalculam-se por inteiro (`CREATE OR REPLACE`): com dezenas de milhares de linhas demora
# MAGIC segundos e evita erros de agregação incremental. O Delta guarda as versões anteriores.
# MAGIC Cada tabela tem `atualizado_em`, que o backoffice mostra («Databricks · atualizado a …»).

# COMMAND ----------

import re

dbutils.widgets.text("catalog", "sinaliza", "Catálogo")
catalog = dbutils.widgets.get("catalog")
assert re.fullmatch(r"[a-z_][a-z0-9_]*", catalog), f"Nome de catálogo inválido: {catalog}"
spark.sql(f"USE CATALOG {catalog}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Base comum
# MAGIC
# MAGIC Uma vista temporária com as ocorrências não anuladas e o nome atual de cada categoria.

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TEMP VIEW factos AS
# MAGIC SELECT o.*, coalesce(c.name, o.category_name) AS categoria_nome
# MAGIC FROM silver.occurrences o
# MAGIC LEFT JOIN silver.categories c ON c.slug = o.category_slug
# MAGIC WHERE o.status <> 'ANULADA'

# COMMAND ----------

# MAGIC %md
# MAGIC ## `gold.kpi_diario`
# MAGIC
# MAGIC Duas contagens no mesmo grão, cada uma pelo seu dia:
# MAGIC
# MAGIC - `criadas`, pelo **dia de criação** e estado atual;
# MAGIC - `resolvidas` e `soma_dias_resolucao`, pelo **dia de resolução**.
# MAGIC
# MAGIC Assim qualquer período (`dia BETWEEN :de AND :ate`) dá exatamente os mesmos números que a
# MAGIC base operacional: total, em curso, rejeitadas, duplicadas, resolvidas e tempo médio
# MAGIC (`soma_dias_resolucao / resolvidas`).

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE gold.kpi_diario
# MAGIC CLUSTER BY (dia)
# MAGIC COMMENT 'Ocorrências criadas (por dia de criação e estado) e resolvidas (por dia de resolução).'
# MAGIC AS
# MAGIC WITH criadas AS (
# MAGIC   SELECT created_date AS dia, category_slug, max(categoria_nome) AS categoria_nome, status,
# MAGIC          count(*) AS criadas
# MAGIC   FROM factos GROUP BY created_date, category_slug, status
# MAGIC ),
# MAGIC resolvidas AS (
# MAGIC   SELECT resolved_date AS dia, category_slug, max(categoria_nome) AS categoria_nome, status,
# MAGIC          count(*) AS resolvidas, sum(resolution_days) AS soma_dias_resolucao
# MAGIC   FROM factos WHERE resolved_at IS NOT NULL
# MAGIC   GROUP BY resolved_date, category_slug, status
# MAGIC )
# MAGIC SELECT coalesce(c.dia, r.dia) AS dia,
# MAGIC        coalesce(c.category_slug, r.category_slug) AS categoria_slug,
# MAGIC        coalesce(c.categoria_nome, r.categoria_nome) AS categoria_nome,
# MAGIC        coalesce(c.status, r.status) AS estado,
# MAGIC        coalesce(c.criadas, 0) AS criadas,
# MAGIC        coalesce(r.resolvidas, 0) AS resolvidas,
# MAGIC        coalesce(r.soma_dias_resolucao, 0) AS soma_dias_resolucao,
# MAGIC        current_timestamp() AS atualizado_em
# MAGIC FROM criadas c
# MAGIC FULL OUTER JOIN resolvidas r
# MAGIC   ON c.dia = r.dia AND c.category_slug = r.category_slug AND c.status = r.status

# COMMAND ----------

# MAGIC %md
# MAGIC ## `gold.tempo_resolucao`
# MAGIC
# MAGIC Por mês de resolução e categoria: média, mediana e percentil 90. As funções de janela dão o
# MAGIC lugar de cada categoria no mês (`rank`) e a variação face ao mês anterior (`lag`).

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE gold.tempo_resolucao
# MAGIC COMMENT 'Dias até à resolução por mês e categoria (média, mediana, p90).'
# MAGIC AS
# MAGIC WITH por_mes AS (
# MAGIC   SELECT trunc(resolved_date, 'MM') AS mes, category_slug AS categoria_slug,
# MAGIC          max(categoria_nome) AS categoria_nome,
# MAGIC          count(*) AS resolvidas,
# MAGIC          round(avg(resolution_days), 2) AS media_dias,
# MAGIC          round(percentile(resolution_days, 0.5), 2) AS mediana_dias,
# MAGIC          round(percentile(resolution_days, 0.9), 2) AS p90_dias
# MAGIC   FROM factos
# MAGIC   WHERE resolved_at IS NOT NULL
# MAGIC   GROUP BY trunc(resolved_date, 'MM'), category_slug
# MAGIC )
# MAGIC SELECT *,
# MAGIC        rank() OVER (PARTITION BY mes ORDER BY media_dias DESC) AS posicao_no_mes,
# MAGIC        round(media_dias - lag(media_dias) OVER (PARTITION BY categoria_slug ORDER BY mes), 2)
# MAGIC          AS variacao_mes_anterior,
# MAGIC        current_timestamp() AS atualizado_em
# MAGIC FROM por_mes

# COMMAND ----------

# MAGIC %md
# MAGIC ## `gold.hotspots_h3`
# MAGIC
# MAGIC A silver guarda a célula H3 de resolução 9; aqui sobe-se para a resolução 8 (`h3_toparent`,
# MAGIC hexágonos de ~460 m de lado e ~0,74 km²). São cerca de 3× maiores do que as células de 0,005°
# MAGIC (~0,23 km²) da base operacional: menos pontos quentes, mais concentrados. O centro de
# MAGIC cada hexágono vem de `h3_centerasgeojson` (GeoJSON, para mapas) e em `lat`/`lng` (para a API).

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE gold.hotspots_h3
# MAGIC CLUSTER BY (dia)
# MAGIC COMMENT 'Ocorrências por dia de criação, categoria e hexágono H3 (resolução 8).'
# MAGIC AS
# MAGIC WITH celulas AS (
# MAGIC   SELECT created_date AS dia, category_slug AS categoria_slug,
# MAGIC          h3_toparent(h3_cell, 8) AS h3_celula, count(*) AS ocorrencias
# MAGIC   FROM factos
# MAGIC   GROUP BY created_date, category_slug, h3_toparent(h3_cell, 8)
# MAGIC ),
# MAGIC centros AS (
# MAGIC   SELECT h3_celula, h3_centerasgeojson(h3_celula) AS centro_geojson
# MAGIC   FROM (SELECT DISTINCT h3_celula FROM celulas)
# MAGIC )
# MAGIC SELECT c.dia, c.categoria_slug, c.h3_celula, h3_h3tostring(c.h3_celula) AS h3_texto,
# MAGIC        x.centro_geojson,
# MAGIC        round(from_json(x.centro_geojson, 'coordinates ARRAY<DOUBLE>').coordinates[1], 5) AS lat,
# MAGIC        round(from_json(x.centro_geojson, 'coordinates ARRAY<DOUBLE>').coordinates[0], 5) AS lng,
# MAGIC        c.ocorrencias,
# MAGIC        current_timestamp() AS atualizado_em
# MAGIC FROM celulas c JOIN centros x USING (h3_celula)

# COMMAND ----------

# MAGIC %md
# MAGIC ## `gold.tendencia_mensal`
# MAGIC
# MAGIC Média móvel de 3 meses e variação homóloga (mesmo mês do ano anterior) com funções de janela.

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE gold.tendencia_mensal
# MAGIC COMMENT 'Criadas e resolvidas por mês, com média móvel e variação homóloga.'
# MAGIC AS
# MAGIC WITH meses AS (
# MAGIC   SELECT explode(sequence(trunc(min(created_date), 'MM'), trunc(current_date(), 'MM'),
# MAGIC                           INTERVAL 1 MONTH)) AS mes
# MAGIC   FROM factos
# MAGIC ),
# MAGIC criadas AS (
# MAGIC   SELECT trunc(created_date, 'MM') AS mes, count(*) AS criadas FROM factos GROUP BY 1
# MAGIC ),
# MAGIC resolvidas AS (
# MAGIC   SELECT trunc(resolved_date, 'MM') AS mes, count(*) AS resolvidas
# MAGIC   FROM factos WHERE resolved_at IS NOT NULL GROUP BY 1
# MAGIC ),
# MAGIC juntas AS (
# MAGIC   SELECT m.mes, coalesce(c.criadas, 0) AS criadas, coalesce(r.resolvidas, 0) AS resolvidas
# MAGIC   FROM meses m LEFT JOIN criadas c USING (mes) LEFT JOIN resolvidas r USING (mes)
# MAGIC )
# MAGIC SELECT mes, criadas, resolvidas,
# MAGIC        round(avg(criadas) OVER (ORDER BY mes ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 1)
# MAGIC          AS criadas_media_3m,
# MAGIC        sum(criadas) OVER (ORDER BY mes ROWS UNBOUNDED PRECEDING) AS criadas_acumulado,
# MAGIC        round(try_divide(criadas - lag(criadas, 12) OVER (ORDER BY mes),
# MAGIC                          lag(criadas, 12) OVER (ORDER BY mes)), 4) AS variacao_homologa,
# MAGIC        current_timestamp() AS atualizado_em
# MAGIC FROM juntas

# COMMAND ----------

# MAGIC %md
# MAGIC ## `gold.taxas`
# MAGIC
# MAGIC Taxas sobre as ocorrências criadas no mês: rejeição e duplicação sobre as não anuladas (como
# MAGIC no backoffice); anulação sobre todas.

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE gold.taxas
# MAGIC COMMENT 'Taxas de rejeição, duplicação e anulação por mês de criação e categoria.'
# MAGIC AS
# MAGIC SELECT trunc(created_date, 'MM') AS mes, category_slug AS categoria_slug,
# MAGIC        count_if(status <> 'ANULADA') AS criadas,
# MAGIC        count_if(status = 'REJEITADA') AS rejeitadas,
# MAGIC        count_if(status = 'DUPLICADA') AS duplicadas,
# MAGIC        count_if(status = 'ANULADA') AS anuladas,
# MAGIC        round(try_divide(count_if(status = 'REJEITADA'), count_if(status <> 'ANULADA')), 4) AS taxa_rejeicao,
# MAGIC        round(try_divide(count_if(status = 'DUPLICADA'), count_if(status <> 'ANULADA')), 4) AS taxa_duplicacao,
# MAGIC        round(count_if(status = 'ANULADA') / count(*), 4) AS taxa_anulacao,
# MAGIC        current_timestamp() AS atualizado_em
# MAGIC FROM silver.occurrences
# MAGIC GROUP BY trunc(created_date, 'MM'), category_slug

# COMMAND ----------

# MAGIC %md
# MAGIC ## `gold.backlog`
# MAGIC
# MAGIC Quantas ocorrências estavam em curso no fim de cada dia. Em vez de cruzar cada dia com cada
# MAGIC ocorrência, soma-se +1 no dia em que entra e −1 no dia em que fecha, e acumula-se com uma
# MAGIC janela (`sum … OVER (ORDER BY dia)`).

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE gold.backlog
# MAGIC COMMENT 'Ocorrências em curso no fim de cada dia (inclui as que mais tarde foram anuladas).'
# MAGIC AS
# MAGIC WITH movimentos AS (
# MAGIC   SELECT created_date AS dia, 1 AS entradas, 0 AS saidas FROM silver.occurrences
# MAGIC   UNION ALL
# MAGIC   SELECT closed_date, 0, 1 FROM silver.occurrences WHERE closed_date IS NOT NULL
# MAGIC ),
# MAGIC por_dia AS (
# MAGIC   SELECT dia, sum(entradas) AS entradas, sum(saidas) AS saidas FROM movimentos GROUP BY dia
# MAGIC ),
# MAGIC dias AS (
# MAGIC   SELECT explode(sequence(min(dia), current_date())) AS dia FROM por_dia
# MAGIC )
# MAGIC SELECT d.dia,
# MAGIC        coalesce(p.entradas, 0) AS entradas,
# MAGIC        coalesce(p.saidas, 0) AS saidas,
# MAGIC        sum(coalesce(p.entradas, 0) - coalesce(p.saidas, 0))
# MAGIC          OVER (ORDER BY d.dia ROWS UNBOUNDED PRECEDING) AS em_curso,
# MAGIC        current_timestamp() AS atualizado_em
# MAGIC FROM dias d LEFT JOIN por_dia p USING (dia)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Documentação e verificação

# COMMAND ----------

for table in ("kpi_diario", "tempo_resolucao", "hotspots_h3", "tendencia_mensal", "taxas", "backlog"):
    spark.sql(f"ALTER TABLE gold.{table} SET TAGS ('camada' = 'gold', 'dados_pessoais' = 'nao')")

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Os totais da gold têm de bater com a silver.
# MAGIC SELECT
# MAGIC   (SELECT sum(criadas) FROM gold.kpi_diario) AS criadas_gold,
# MAGIC   (SELECT count(*) FROM silver.occurrences WHERE status <> 'ANULADA') AS criadas_silver,
# MAGIC   (SELECT sum(resolvidas) FROM gold.kpi_diario) AS resolvidas_gold,
# MAGIC   (SELECT count(*) FROM silver.occurrences WHERE status = 'RESOLVIDA') AS resolvidas_silver,
# MAGIC   (SELECT sum(ocorrencias) FROM gold.hotspots_h3) AS hotspots_gold,
# MAGIC   (SELECT em_curso FROM gold.backlog ORDER BY dia DESC LIMIT 1) AS em_curso_hoje,
# MAGIC   (SELECT count(*) FROM silver.occurrences
# MAGIC     WHERE status IN ('RECEBIDA', 'EM_ANALISE', 'EM_RESOLUCAO')) AS em_curso_silver

# COMMAND ----------

check = spark.sql(
    """
    SELECT (SELECT sum(criadas) FROM gold.kpi_diario)
             = (SELECT count(*) FROM silver.occurrences WHERE status <> 'ANULADA') AS criadas_ok,
           (SELECT em_curso FROM gold.backlog ORDER BY dia DESC LIMIT 1)
             = (SELECT count(*) FROM silver.occurrences
                WHERE status IN ('RECEBIDA', 'EM_ANALISE', 'EM_RESOLUCAO')) AS backlog_ok
    """
).first()
assert check["criadas_ok"] and check["backlog_ok"], f"A gold não bate com a silver: {check}"
