# Databricks notebook source
# MAGIC %md
# MAGIC # 00 · Preparação do Unity Catalog
# MAGIC
# MAGIC Cria a estrutura do lakehouse do Sinaliza (arquitetura *medallion*):
# MAGIC
# MAGIC | Camada | Esquema | Conteúdo |
# MAGIC | --- | --- | --- |
# MAGIC | Bronze | `sinaliza.bronze` | ficheiros Parquet tal como chegam, mais `_ingested_at` e `_source_file` |
# MAGIC | Silver | `sinaliza.silver` | dados limpos, tipados, sem duplicados e com restrições |
# MAGIC | Gold | `sinaliza.gold` | indicadores prontos para o backoffice e para o dashboard |
# MAGIC
# MAGIC O volume `sinaliza.bronze.landing` recebe os ficheiros do `analytics/export` (ou do gerador),
# MAGIC numa pasta por tabela. O volume `sinaliza.bronze.checkpoints` guarda o estado do Auto Loader.
# MAGIC
# MAGIC Corre-se uma vez (e pode repetir-se: todos os comandos são idempotentes).

# COMMAND ----------

import re

dbutils.widgets.text("catalog", "sinaliza", "Catálogo")
dbutils.widgets.text("leitores", "account users", "Grupo com leitura da gold")
catalog = dbutils.widgets.get("catalog")
readers = dbutils.widgets.get("leitores")
# Names go into DDL, which takes no parameter markers: accept only plain names.
assert re.fullmatch(r"[a-z_][a-z0-9_]*", catalog), f"Nome de catálogo inválido: {catalog}"
assert re.fullmatch(r"[\w .@-]+", readers), f"Nome de grupo inválido: {readers}"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Catálogo, esquemas e volumes
# MAGIC
# MAGIC Na Free Edition o catálogo fica no armazenamento gerido pela Databricks (não há localização
# MAGIC própria).

# COMMAND ----------

spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog} COMMENT 'Sinaliza: ocorrências urbanas de Barcelos'")
spark.sql(f"USE CATALOG {catalog}")

spark.sql("CREATE SCHEMA IF NOT EXISTS bronze COMMENT 'Ficheiros recebidos, sem transformação'")
spark.sql("CREATE SCHEMA IF NOT EXISTS silver COMMENT 'Dados limpos, deduplicados e validados'")
spark.sql("CREATE SCHEMA IF NOT EXISTS gold COMMENT 'Indicadores para o backoffice e dashboards'")

spark.sql(
    "CREATE VOLUME IF NOT EXISTS bronze.landing "
    "COMMENT 'Parquet exportados da occurrence_db e da municipal_db (uma pasta por tabela)'"
)
spark.sql("CREATE VOLUME IF NOT EXISTS bronze.checkpoints COMMENT 'Estado do Auto Loader'")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pastas de chegada
# MAGIC
# MAGIC O Auto Loader precisa que a pasta exista antes do primeiro ficheiro.

# COMMAND ----------

for table in ("occurrences", "status_history", "categories"):
    dbutils.fs.mkdirs(f"/Volumes/{catalog}/bronze/landing/{table}")

display(dbutils.fs.ls(f"/Volumes/{catalog}/bronze/landing"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Permissões
# MAGIC
# MAGIC Princípio do menor privilégio: o grupo de leitores só vê a camada **gold** (agregada, sem
# MAGIC identificadores de cidadãos). Bronze e silver ficam reservadas ao dono do catálogo e ao job.
# MAGIC O token usado pelo `occurrence-service` deve pertencer a uma identidade deste grupo.

# COMMAND ----------

spark.sql(f"GRANT USE CATALOG ON CATALOG {catalog} TO `{readers}`")
spark.sql(f"GRANT USE SCHEMA, SELECT ON SCHEMA {catalog}.gold TO `{readers}`")

display(spark.sql("SHOW GRANTS ON SCHEMA gold"))
