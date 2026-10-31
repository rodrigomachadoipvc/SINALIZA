# Databricks notebook source
# MAGIC %md
# MAGIC # 04 · Otimização e governança
# MAGIC
# MAGIC 1. **Liquid Clustering** na `silver.occurrences` por (`category_slug`, `created_date`), as
# MAGIC    colunas por que os indicadores filtram, e `OPTIMIZE` — com medição antes e depois.
# MAGIC 2. **VACUUM** dos ficheiros que já nenhuma versão usa.
# MAGIC 3. **Time Travel:** `DESCRIBE HISTORY` e `VERSION AS OF`.
# MAGIC 4. **Governança:** comentários, *tags* de colunas sensíveis e permissões da gold.
# MAGIC
# MAGIC Não faz parte do job diário: corre-se à mão (ou num job semanal) quando a tabela cresce.

# COMMAND ----------

import re
import time

dbutils.widgets.text("catalog", "sinaliza", "Catálogo")
dbutils.widgets.text("leitores", "account users", "Grupo com leitura da gold")
catalog = dbutils.widgets.get("catalog")
readers = dbutils.widgets.get("leitores")
assert re.fullmatch(r"[a-z_][a-z0-9_]*", catalog), f"Nome de catálogo inválido: {catalog}"
assert re.fullmatch(r"[\w .@-]+", readers), f"Nome de grupo inválido: {readers}"
spark.sql(f"USE CATALOG {catalog}")

# A typical dashboard filter: one category over one quarter.
PROBE = """
    SELECT count(*) AS n, avg(resolution_days) AS media
    FROM silver.occurrences
    WHERE category_slug = 'vias' AND created_date BETWEEN DATE'2025-01-01' AND DATE'2025-03-31'
"""


def layout() -> dict:
    detail = spark.sql("DESCRIBE DETAIL silver.occurrences").first()
    return {
        "ficheiros": detail["numFiles"],
        "mb": round(detail["sizeInBytes"] / 1024 / 1024, 2),
        "clustering": detail["clusteringColumns"],
    }


def probe(runs: int = 5) -> float:
    """Median time of the probe query, in milliseconds."""
    times = []
    for _ in range(runs):
        start = time.perf_counter()
        spark.sql(PROBE).collect()
        times.append((time.perf_counter() - start) * 1000)
    return round(sorted(times)[len(times) // 2], 1)


# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Antes

# COMMAND ----------

before = {**layout(), "consulta_ms": probe()}
before

# COMMAND ----------

# MAGIC %md
# MAGIC ## Liquid Clustering + OPTIMIZE
# MAGIC
# MAGIC **Porquê Liquid Clustering e não `ZORDER`?** O `ZORDER BY` reescreve todos os ficheiros em cada
# MAGIC `OPTIMIZE` e as colunas ficam presas ao comando; o Liquid Clustering é incremental (só
# MAGIC reorganiza o que ainda não está agrupado), as chaves podem mudar com um `ALTER TABLE` e é o
# MAGIC recomendado pela Databricks para tabelas novas. Não se pode combinar com partições — e com
# MAGIC dezenas de milhares de linhas, particionar por dia criaria milhares de ficheiros pequenos.
# MAGIC
# MAGIC `OPTIMIZE … FULL` reagrupa também os ficheiros escritos antes de as chaves existirem.

# COMMAND ----------

# MAGIC %sql
# MAGIC ALTER TABLE silver.occurrences CLUSTER BY (category_slug, created_date);
# MAGIC OPTIMIZE silver.occurrences FULL;

# COMMAND ----------

# MAGIC %md
# MAGIC ## Depois
# MAGIC
# MAGIC Menos ficheiros, e para o filtro da sonda o motor salta os que não têm `vias` nesse trimestre
# MAGIC (*data skipping* pelas estatísticas mín./máx. de cada ficheiro). Com estes volumes a diferença
# MAGIC de tempo é pequena e o *cache* do serverless pesa: o indicador fiável é o número de ficheiros
# MAGIC lidos, que se vê no *Query Profile* da consulta (`files read` / `files pruned`).

# COMMAND ----------

after = {**layout(), "consulta_ms": probe()}
display(
    spark.createDataFrame(
        [
            ("antes", before["ficheiros"], before["mb"], str(before["clustering"]), before["consulta_ms"]),
            ("depois", after["ficheiros"], after["mb"], str(after["clustering"]), after["consulta_ms"]),
        ],
        "momento STRING, ficheiros LONG, mb DOUBLE, clustering STRING, consulta_ms DOUBLE",
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC As tabelas gold mais consultadas também ficam agrupadas pelo dia (definido no `CREATE` do
# MAGIC notebook 03); basta otimizá-las.

# COMMAND ----------

# MAGIC %sql
# MAGIC OPTIMIZE gold.kpi_diario;
# MAGIC OPTIMIZE gold.hotspots_h3;

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. VACUUM
# MAGIC
# MAGIC Depois do `OPTIMIZE` os ficheiros antigos continuam lá para o Time Travel. O `VACUUM` apaga os
# MAGIC que nenhuma versão dos últimos 7 dias (o mínimo por omissão) referencia. Primeiro vê-se a lista
# MAGIC (`DRY RUN`); encurtar a retenção exigiria desligar uma proteção e perder-se-ia histórico.

# COMMAND ----------

# MAGIC %sql
# MAGIC VACUUM silver.occurrences RETAIN 168 HOURS DRY RUN

# COMMAND ----------

# MAGIC %sql
# MAGIC VACUUM silver.occurrences RETAIN 168 HOURS

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Time Travel
# MAGIC
# MAGIC Cada escrita cria uma versão. Pode consultar-se a tabela como estava numa versão ou data —
# MAGIC útil para auditar um indicador ou recuperar de uma carga errada (`RESTORE TABLE … TO VERSION AS
# MAGIC OF n`, que não se corre aqui).

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT version, timestamp, operation, operationMetrics.numOutputRows AS linhas_escritas
# MAGIC FROM (DESCRIBE HISTORY silver.occurrences)
# MAGIC ORDER BY version DESC
# MAGIC LIMIT 10

# COMMAND ----------

first = spark.sql("SELECT min(version) AS v FROM (DESCRIBE HISTORY silver.occurrences)").first()["v"]
display(
    spark.sql(
        f"""
        SELECT 'versão {first}' AS momento, count(*) AS ocorrencias
        FROM silver.occurrences VERSION AS OF {int(first)}
        UNION ALL
        SELECT 'atual', count(*) FROM silver.occurrences
        """
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Governança
# MAGIC
# MAGIC Comentários nas colunas principais e *tags* que identificam o que é pseudónimo ou texto livre
# MAGIC (pesquisáveis no Catalog Explorer e em `information_schema`).

# COMMAND ----------

# MAGIC %sql
# MAGIC ALTER TABLE silver.occurrences ALTER COLUMN status COMMENT
# MAGIC   'Estado atual: RECEBIDA, EM_ANALISE, EM_RESOLUCAO, RESOLVIDA, REJEITADA, DUPLICADA ou ANULADA';
# MAGIC ALTER TABLE silver.occurrences ALTER COLUMN reference COMMENT 'Referência pública SIN-AAAA-NNNNN';
# MAGIC ALTER TABLE silver.occurrences ALTER COLUMN citizen_id SET TAGS ('dados_pessoais' = 'pseudonimo');
# MAGIC ALTER TABLE silver.occurrences ALTER COLUMN address SET TAGS ('dados_pessoais' = 'localizacao');
# MAGIC ALTER TABLE silver.occurrences ALTER COLUMN rejection_reason SET TAGS ('texto_livre' = 'gestor');
# MAGIC ALTER TABLE silver.status_history ALTER COLUMN changed_by SET TAGS ('dados_pessoais' = 'pseudonimo');
# MAGIC ALTER TABLE silver.occurrences SET TAGS ('camada' = 'silver', 'dono' = 'sinaliza-analytics');
# MAGIC ALTER TABLE silver.status_history SET TAGS ('camada' = 'silver', 'dono' = 'sinaliza-analytics');
# MAGIC ALTER TABLE silver.categories SET TAGS ('camada' = 'silver', 'dono' = 'sinaliza-analytics');

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT table_schema, table_name, column_name, tag_name, tag_value
# MAGIC FROM information_schema.column_tags
# MAGIC ORDER BY table_schema, table_name, column_name

# COMMAND ----------

# MAGIC %md
# MAGIC ### Permissões
# MAGIC
# MAGIC Os leitores (incluindo a identidade do token do `occurrence-service`) só leem a gold. Retira-se
# MAGIC explicitamente qualquer acesso à bronze e à silver que tenha sido dado à mão.

# COMMAND ----------

spark.sql(f"GRANT USE SCHEMA, SELECT ON SCHEMA {catalog}.gold TO `{readers}`")
for schema in ("bronze", "silver"):
    spark.sql(f"REVOKE ALL PRIVILEGES ON SCHEMA {catalog}.{schema} FROM `{readers}`")
display(spark.sql(f"SHOW GRANTS `{readers}` ON SCHEMA {catalog}.gold"))
