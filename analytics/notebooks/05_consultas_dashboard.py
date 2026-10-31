# Databricks notebook source
# MAGIC %md
# MAGIC # 05 · Consultas do dashboard
# MAGIC
# MAGIC As consultas que o `occurrence-service` envia à **SQL Statement Execution API** quando
# MAGIC `ANALYTICS_SOURCE=databricks` (ficheiro
# MAGIC `services/occurrence-service/src/stats/databricks-queries.ts`). O texto é o mesmo — um teste em
# MAGIC `analytics/tests` garante que não divergem. Correm com o catálogo `sinaliza` e o esquema `gold`
# MAGIC por omissão, e os parâmetros `:date_from` e `:date_to` vêm dos *widgets* abaixo.
# MAGIC
# MAGIC No fim há consultas extra para um **dashboard AI/BI** (opcional): crie-o em *Dashboards → Create
# MAGIC dashboard*, adicione cada consulta como *dataset* e escolha as visualizações sugeridas.

# COMMAND ----------

import re

dbutils.widgets.text("catalog", "sinaliza", "Catálogo")
dbutils.widgets.text("date_from", "2025-11-01", "De (AAAA-MM-DD)")
dbutils.widgets.text("date_to", "2026-10-31", "Até (AAAA-MM-DD)")
catalog = dbutils.widgets.get("catalog")
assert re.fullmatch(r"[a-z_][a-z0-9_]*", catalog), f"Nome de catálogo inválido: {catalog}"
spark.sql(f"USE CATALOG {catalog}")
spark.sql("USE SCHEMA gold")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Consultas do backoffice
# MAGIC
# MAGIC ### Totais

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT coalesce(sum(criadas), 0) AS total,
# MAGIC        coalesce(sum(criadas) FILTER (WHERE estado IN ('RECEBIDA', 'EM_ANALISE', 'EM_RESOLUCAO')), 0) AS abertas,
# MAGIC        coalesce(sum(criadas) FILTER (WHERE estado = 'REJEITADA'), 0) AS rejeitadas,
# MAGIC        coalesce(sum(criadas) FILTER (WHERE estado = 'DUPLICADA'), 0) AS duplicadas,
# MAGIC        coalesce(sum(resolvidas), 0) AS resolvidas,
# MAGIC        try_divide(sum(soma_dias_resolucao), sum(resolvidas)) AS media_dias,
# MAGIC        (SELECT max(atualizado_em) FROM kpi_diario) AS atualizado_em
# MAGIC FROM kpi_diario
# MAGIC WHERE dia BETWEEN :date_from AND :date_to

# COMMAND ----------

# MAGIC %md
# MAGIC ### Por estado

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT estado, sum(criadas) AS n
# MAGIC FROM kpi_diario
# MAGIC WHERE dia BETWEEN :date_from AND :date_to
# MAGIC GROUP BY estado
# MAGIC HAVING sum(criadas) > 0
# MAGIC ORDER BY n DESC, estado

# COMMAND ----------

# MAGIC %md
# MAGIC ### Por categoria

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT categoria_slug, max(categoria_nome) AS categoria_nome, sum(criadas) AS n
# MAGIC FROM kpi_diario
# MAGIC WHERE dia BETWEEN :date_from AND :date_to
# MAGIC GROUP BY categoria_slug
# MAGIC HAVING sum(criadas) > 0
# MAGIC ORDER BY n DESC, categoria_slug

# COMMAND ----------

# MAGIC %md
# MAGIC ### Tendência mensal
# MAGIC
# MAGIC Os meses sem ocorrências não aparecem; a API preenche-os com zeros.

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT date_format(dia, 'yyyy-MM') AS mes, sum(criadas) AS criadas, sum(resolvidas) AS resolvidas
# MAGIC FROM kpi_diario
# MAGIC WHERE dia BETWEEN :date_from AND :date_to
# MAGIC GROUP BY date_format(dia, 'yyyy-MM')
# MAGIC ORDER BY mes

# COMMAND ----------

# MAGIC %md
# MAGIC ### Tempo de resolução por categoria

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT categoria_slug, max(categoria_nome) AS categoria_nome, sum(resolvidas) AS resolvidas,
# MAGIC        sum(soma_dias_resolucao) / sum(resolvidas) AS media_dias
# MAGIC FROM kpi_diario
# MAGIC WHERE dia BETWEEN :date_from AND :date_to
# MAGIC GROUP BY categoria_slug
# MAGIC HAVING sum(resolvidas) > 0
# MAGIC ORDER BY media_dias DESC, categoria_slug

# COMMAND ----------

# MAGIC %md
# MAGIC ### Pontos quentes (as 50 células H3 com mais ocorrências)

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT lat, lng, sum(ocorrencias) AS n
# MAGIC FROM hotspots_h3
# MAGIC WHERE dia BETWEEN :date_from AND :date_to
# MAGIC GROUP BY h3_celula, lat, lng
# MAGIC ORDER BY n DESC, lat, lng
# MAGIC LIMIT 50

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dashboard AI/BI (opcional)
# MAGIC
# MAGIC | Dataset | Visualização sugerida |
# MAGIC | --- | --- |
# MAGIC | Tendência mensal | linhas: `criadas`, `resolvidas`, `criadas_media_3m` por `mes` |
# MAGIC | Backlog | área: `em_curso` por `dia` |
# MAGIC | Tempo de resolução | barras: `mediana_dias` e `p90_dias` por categoria, filtro por `mes` |
# MAGIC | Taxas | tabela com formatação condicional em `taxa_rejeicao` |
# MAGIC | Mapa de calor | mapa de pontos: `lat`, `lng`, tamanho `ocorrencias` |

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT mes, criadas, resolvidas, criadas_media_3m, variacao_homologa
# MAGIC FROM tendencia_mensal
# MAGIC ORDER BY mes

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT dia, em_curso, entradas, saidas
# MAGIC FROM backlog
# MAGIC WHERE dia >= add_months(current_date(), -12)
# MAGIC ORDER BY dia

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT mes, categoria_nome, resolvidas, media_dias, mediana_dias, p90_dias, posicao_no_mes
# MAGIC FROM tempo_resolucao
# MAGIC WHERE mes >= add_months(trunc(current_date(), 'MM'), -11)
# MAGIC ORDER BY mes DESC, posicao_no_mes

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT mes, categoria_slug, criadas, taxa_rejeicao, taxa_duplicacao, taxa_anulacao
# MAGIC FROM taxas
# MAGIC WHERE mes >= add_months(trunc(current_date(), 'MM'), -11)
# MAGIC ORDER BY mes DESC, taxa_rejeicao DESC

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT h3_texto, lat, lng, centro_geojson, sum(ocorrencias) AS ocorrencias
# MAGIC FROM hotspots_h3
# MAGIC WHERE dia BETWEEN :date_from AND :date_to
# MAGIC GROUP BY h3_texto, lat, lng, centro_geojson
# MAGIC ORDER BY ocorrencias DESC
