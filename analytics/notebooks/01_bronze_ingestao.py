# Databricks notebook source
# MAGIC %md
# MAGIC # 01 · Bronze: ingestão com Auto Loader
# MAGIC
# MAGIC Lê os Parquet que chegam a `/Volumes/sinaliza/bronze/landing/<tabela>/` e acrescenta-os às
# MAGIC tabelas Delta `bronze.<tabela>`, sem os alterar. Cada linha ganha:
# MAGIC
# MAGIC - `_ingested_at`: quando foi ingerida;
# MAGIC - `_source_file`: o ficheiro de onde veio (rastreabilidade).
# MAGIC
# MAGIC **Porquê Auto Loader (`cloudFiles`)?** Guarda no checkpoint os ficheiros já processados, por
# MAGIC isso cada execução só lê os novos — mesmo que o export envie milhares de ficheiros ao longo do
# MAGIC tempo. Em computação *serverless* usa-se `trigger(availableNow=True)`: processa o que houver e
# MAGIC termina, o que encaixa num job diário.
# MAGIC
# MAGIC **Evolução do esquema:** se o export passar a enviar uma coluna nova, o Auto Loader acrescenta-a
# MAGIC (`addNewColumns`) e a escrita Delta aceita-a (`mergeSchema`). A primeira execução com a coluna
# MAGIC nova pára com `UnknownFieldException` por desenho; a seguinte (o job tem uma nova tentativa)
# MAGIC já usa o esquema atualizado. Valores que não encaixam no tipo vão para `_rescued_data`.

# COMMAND ----------

import re

from pyspark.sql import functions as F

dbutils.widgets.text("catalog", "sinaliza", "Catálogo")
catalog = dbutils.widgets.get("catalog")
assert re.fullmatch(r"[a-z_][a-z0-9_]*", catalog), f"Nome de catálogo inválido: {catalog}"
spark.sql(f"USE CATALOG {catalog}")

LANDING = f"/Volumes/{catalog}/bronze/landing"
CHECKPOINTS = f"/Volumes/{catalog}/bronze/checkpoints"
TABLES = ("occurrences", "status_history", "categories")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ingestão
# MAGIC
# MAGIC Os tipos vêm do próprio Parquet (`cloudFiles.inferColumnTypes`): datas como `timestamp`,
# MAGIC coordenadas como `double`. A conversão de estados e a validação ficam para a silver.

# COMMAND ----------


def ingest(table: str) -> dict:
    stream = (
        spark.readStream.format("cloudFiles")
        .option("cloudFiles.format", "parquet")
        .option("cloudFiles.schemaLocation", f"{CHECKPOINTS}/{table}/schema")
        .option("cloudFiles.inferColumnTypes", "true")
        .option("cloudFiles.schemaEvolutionMode", "addNewColumns")
        .load(f"{LANDING}/{table}")
        .withColumn("_ingested_at", F.current_timestamp())
        .withColumn("_source_file", F.col("_metadata.file_path"))
    )
    query = (
        stream.writeStream.format("delta")
        .option("checkpointLocation", f"{CHECKPOINTS}/{table}/stream")
        .option("mergeSchema", "true")
        .trigger(availableNow=True)
        .toTable(f"bronze.{table}")
    )
    query.awaitTermination()
    progress = query.lastProgress or {}
    return {"tabela": table, "linhas_novas": progress.get("numInputRows", 0)}


results = [ingest(table) for table in TABLES]
display(spark.createDataFrame(results))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Documentação das tabelas
# MAGIC
# MAGIC Comentários e *tags* ficam no Unity Catalog e aparecem no Catalog Explorer.

# COMMAND ----------

# MAGIC %sql
# MAGIC COMMENT ON TABLE bronze.occurrences IS
# MAGIC   'Ocorrências tal como exportadas da occurrence_db (sem nome, email nem descrição do cidadão).';
# MAGIC COMMENT ON TABLE bronze.status_history IS 'Histórico de estados exportado da occurrence_db.';
# MAGIC COMMENT ON TABLE bronze.categories IS 'Categorias exportadas da municipal_db.';
# MAGIC ALTER TABLE bronze.occurrences SET TAGS ('camada' = 'bronze', 'origem' = 'occurrence_db');
# MAGIC ALTER TABLE bronze.status_history SET TAGS ('camada' = 'bronze', 'origem' = 'occurrence_db');
# MAGIC ALTER TABLE bronze.categories SET TAGS ('camada' = 'bronze', 'origem' = 'municipal_db');

# COMMAND ----------

# MAGIC %md
# MAGIC ## Verificação
# MAGIC
# MAGIC Quantas linhas chegaram em cada lote (um lote = um ficheiro do export).

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT 'occurrences' AS tabela, _source_file, count(*) AS linhas, max(_ingested_at) AS ingerido
# MAGIC FROM bronze.occurrences GROUP BY _source_file
# MAGIC UNION ALL
# MAGIC SELECT 'status_history', _source_file, count(*), max(_ingested_at)
# MAGIC FROM bronze.status_history GROUP BY _source_file
# MAGIC UNION ALL
# MAGIC SELECT 'categories', _source_file, count(*), max(_ingested_at)
# MAGIC FROM bronze.categories GROUP BY _source_file
# MAGIC ORDER BY ingerido DESC, tabela
