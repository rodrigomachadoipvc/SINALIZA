# Databricks notebook source
# MAGIC %md
# MAGIC # 02 · Silver: limpeza, deduplicação e qualidade
# MAGIC
# MAGIC Transforma a bronze (tudo o que chegou, com repetições) numa versão por registo:
# MAGIC
# MAGIC 1. **Tipos explícitos** e colunas derivadas (data local de criação, dias de resolução, célula H3).
# MAGIC 2. **Deduplicação com `MERGE INTO`** por `id`, ficando a versão com o `updated_at` mais recente.
# MAGIC    O export é incremental e pode reenviar linhas; o `MERGE` torna a carga idempotente.
# MAGIC 3. **Qualidade:** `NOT NULL` e restrições `CHECK` no Delta. As linhas que as violariam não
# MAGIC    entram (fariam falhar o lote inteiro): vão para `silver.occurrences_quarentena` com o motivo.
# MAGIC 4. **Change Data Feed** ligado, para que consumidores possam ler só o que mudou.
# MAGIC
# MAGIC Só se processa a bronze ingerida depois da última carga (`_ingested_at`).

# COMMAND ----------

import re

dbutils.widgets.text("catalog", "sinaliza", "Catálogo")
catalog = dbutils.widgets.get("catalog")
assert re.fullmatch(r"[a-z_][a-z0-9_]*", catalog), f"Nome de catálogo inválido: {catalog}"
spark.sql(f"USE CATALOG {catalog}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Tabelas
# MAGIC
# MAGIC Criadas uma vez, com o esquema explícito (em vez de `CREATE TABLE AS`), para que os tipos e as
# MAGIC restrições não dependam do que vier nos ficheiros.

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE TABLE IF NOT EXISTS silver.categories (
# MAGIC   id STRING NOT NULL,
# MAGIC   slug STRING NOT NULL,
# MAGIC   name STRING NOT NULL,
# MAGIC   icon STRING NOT NULL,
# MAGIC   active BOOLEAN NOT NULL,
# MAGIC   created_at TIMESTAMP NOT NULL,
# MAGIC   updated_at TIMESTAMP NOT NULL,
# MAGIC   _ingested_at TIMESTAMP NOT NULL
# MAGIC )
# MAGIC COMMENT 'Categorias da municipal_db, uma linha por categoria.'
# MAGIC TBLPROPERTIES (delta.enableChangeDataFeed = true);
# MAGIC
# MAGIC CREATE TABLE IF NOT EXISTS silver.status_history (
# MAGIC   id STRING NOT NULL,
# MAGIC   occurrence_id STRING NOT NULL,
# MAGIC   from_status STRING,
# MAGIC   to_status STRING NOT NULL,
# MAGIC   note STRING,
# MAGIC   reason STRING,
# MAGIC   changed_by STRING NOT NULL,
# MAGIC   changed_by_role STRING NOT NULL,
# MAGIC   changed_at TIMESTAMP NOT NULL,
# MAGIC   ordem INT COMMENT 'Posição do evento na ocorrência (1 = criação)',
# MAGIC   ate TIMESTAMP COMMENT 'Quando a ocorrência saiu deste estado (nulo se continua nele)',
# MAGIC   horas_no_estado DOUBLE COMMENT 'Tempo passado neste estado, em horas',
# MAGIC   _ingested_at TIMESTAMP NOT NULL
# MAGIC )
# MAGIC COMMENT 'Histórico de estados, ordenado por ocorrência e data.'
# MAGIC TBLPROPERTIES (delta.enableChangeDataFeed = true);
# MAGIC
# MAGIC CREATE TABLE IF NOT EXISTS silver.occurrences (
# MAGIC   id STRING NOT NULL,
# MAGIC   reference STRING NOT NULL,
# MAGIC   citizen_id STRING NOT NULL COMMENT 'Pseudónimo: o nome e o email não saem da occurrence_db',
# MAGIC   category_id STRING NOT NULL,
# MAGIC   category_slug STRING NOT NULL,
# MAGIC   category_name STRING NOT NULL,
# MAGIC   status STRING NOT NULL,
# MAGIC   lat DOUBLE NOT NULL,
# MAGIC   lng DOUBLE NOT NULL,
# MAGIC   h3_cell BIGINT NOT NULL COMMENT 'Célula H3 de resolução 9 (~170 m de lado)',
# MAGIC   address STRING,
# MAGIC   has_photo BOOLEAN NOT NULL,
# MAGIC   original_id STRING,
# MAGIC   rejection_reason STRING,
# MAGIC   created_at TIMESTAMP NOT NULL,
# MAGIC   updated_at TIMESTAMP NOT NULL,
# MAGIC   resolved_at TIMESTAMP,
# MAGIC   cancelled_at TIMESTAMP,
# MAGIC   closed_at TIMESTAMP COMMENT 'Quando deixou de estar em curso (resolvida, rejeitada, duplicada ou anulada)',
# MAGIC   created_date DATE NOT NULL COMMENT 'Dia de criação em Europe/Lisbon',
# MAGIC   resolved_date DATE COMMENT 'Dia de resolução em Europe/Lisbon',
# MAGIC   closed_date DATE,
# MAGIC   resolution_days DOUBLE COMMENT 'Da criação à resolução, em dias',
# MAGIC   _ingested_at TIMESTAMP NOT NULL,
# MAGIC   _source_file STRING
# MAGIC )
# MAGIC COMMENT 'Ocorrências limpas e deduplicadas (uma linha por ocorrência, versão mais recente).'
# MAGIC TBLPROPERTIES (delta.enableChangeDataFeed = true);
# MAGIC
# MAGIC CREATE TABLE IF NOT EXISTS silver.occurrences_quarentena (
# MAGIC   id STRING,
# MAGIC   reference STRING,
# MAGIC   motivo STRING NOT NULL,
# MAGIC   registo STRING NOT NULL COMMENT 'A linha original, em JSON',
# MAGIC   _source_file STRING,
# MAGIC   _ingested_at TIMESTAMP NOT NULL,
# MAGIC   _quarentena_em TIMESTAMP NOT NULL
# MAGIC )
# MAGIC COMMENT 'Linhas da bronze que não passaram as regras de qualidade.';

# COMMAND ----------

# MAGIC %md
# MAGIC ## Restrições de qualidade
# MAGIC
# MAGIC O Delta recusa qualquer escrita que viole uma restrição `CHECK`. Recriam-se a cada execução
# MAGIC (`DROP … IF EXISTS` + `ADD`) para que alterações a este notebook se apliquem.

# COMMAND ----------

# MAGIC %sql
# MAGIC ALTER TABLE silver.occurrences DROP CONSTRAINT IF EXISTS estado_valido;
# MAGIC ALTER TABLE silver.occurrences ADD CONSTRAINT estado_valido CHECK (status IN
# MAGIC   ('RECEBIDA', 'EM_ANALISE', 'EM_RESOLUCAO', 'RESOLVIDA', 'REJEITADA', 'DUPLICADA', 'ANULADA'));
# MAGIC ALTER TABLE silver.occurrences DROP CONSTRAINT IF EXISTS referencia_valida;
# MAGIC ALTER TABLE silver.occurrences ADD CONSTRAINT referencia_valida
# MAGIC   CHECK (reference RLIKE '^SIN-[0-9]{4}-[0-9]{5,}$');
# MAGIC ALTER TABLE silver.occurrences DROP CONSTRAINT IF EXISTS coordenadas_barcelos;
# MAGIC ALTER TABLE silver.occurrences ADD CONSTRAINT coordenadas_barcelos
# MAGIC   CHECK (lat BETWEEN 41.40 AND 41.67 AND lng BETWEEN -8.76 AND -8.48);
# MAGIC ALTER TABLE silver.occurrences DROP CONSTRAINT IF EXISTS datas_coerentes;
# MAGIC ALTER TABLE silver.occurrences ADD CONSTRAINT datas_coerentes CHECK (
# MAGIC   updated_at >= created_at
# MAGIC   AND (resolved_at IS NULL OR resolved_at >= created_at)
# MAGIC   AND (cancelled_at IS NULL OR cancelled_at >= created_at));
# MAGIC ALTER TABLE silver.occurrences DROP CONSTRAINT IF EXISTS resolvida_com_data;
# MAGIC ALTER TABLE silver.occurrences ADD CONSTRAINT resolvida_com_data
# MAGIC   CHECK ((status = 'RESOLVIDA') = (resolved_at IS NOT NULL));
# MAGIC
# MAGIC ALTER TABLE silver.status_history DROP CONSTRAINT IF EXISTS estados_validos;
# MAGIC ALTER TABLE silver.status_history ADD CONSTRAINT estados_validos CHECK (
# MAGIC   to_status IN ('RECEBIDA', 'EM_ANALISE', 'EM_RESOLUCAO', 'RESOLVIDA', 'REJEITADA', 'DUPLICADA', 'ANULADA')
# MAGIC   AND (from_status IS NULL OR from_status IN
# MAGIC     ('RECEBIDA', 'EM_ANALISE', 'EM_RESOLUCAO', 'RESOLVIDA', 'REJEITADA', 'DUPLICADA', 'ANULADA')));
# MAGIC ALTER TABLE silver.status_history DROP CONSTRAINT IF EXISTS papel_valido;
# MAGIC ALTER TABLE silver.status_history ADD CONSTRAINT papel_valido
# MAGIC   CHECK (changed_by_role IN ('CIDADAO', 'GESTOR', 'ADMIN'));

# COMMAND ----------

# MAGIC %md
# MAGIC ## Categorias

# COMMAND ----------

# MAGIC %sql
# MAGIC MERGE INTO silver.categories AS t
# MAGIC USING (
# MAGIC   SELECT CAST(id AS STRING) AS id, slug, name, icon, CAST(active AS BOOLEAN) AS active,
# MAGIC          CAST(created_at AS TIMESTAMP) AS created_at, CAST(updated_at AS TIMESTAMP) AS updated_at,
# MAGIC          _ingested_at
# MAGIC   FROM bronze.categories
# MAGIC   WHERE _ingested_at > (SELECT coalesce(max(_ingested_at), TIMESTAMP '1970-01-01') FROM silver.categories)
# MAGIC   QUALIFY row_number() OVER (PARTITION BY id ORDER BY updated_at DESC, _ingested_at DESC) = 1
# MAGIC ) AS s
# MAGIC ON t.id = s.id
# MAGIC WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE SET *
# MAGIC WHEN NOT MATCHED THEN INSERT *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Histórico de estados
# MAGIC
# MAGIC O histórico só cresce, por isso o `MERGE` apenas insere eventos novos. Depois recalcula-se,
# MAGIC para as ocorrências tocadas neste lote, a ordem dos eventos e o tempo passado em cada estado
# MAGIC (funções de janela `row_number` e `lead`).
# MAGIC
# MAGIC A marca d'água (o último `_ingested_at` já processado) fica fixa numa variável de sessão antes
# MAGIC de escrever: uma vista temporária é recalculada sempre que é lida, e se lesse a marca da própria
# MAGIC silver ficaria vazia logo depois do primeiro `MERGE`.

# COMMAND ----------

# MAGIC %sql
# MAGIC DECLARE OR REPLACE VARIABLE history_until TIMESTAMP;
# MAGIC SET VAR history_until =
# MAGIC   (SELECT coalesce(max(_ingested_at), TIMESTAMP '1970-01-01') FROM silver.status_history);
# MAGIC
# MAGIC CREATE OR REPLACE TEMP VIEW history_batch AS
# MAGIC SELECT CAST(id AS STRING) AS id, CAST(occurrence_id AS STRING) AS occurrence_id,
# MAGIC        from_status, to_status, note, reason, CAST(changed_by AS STRING) AS changed_by,
# MAGIC        changed_by_role, CAST(changed_at AS TIMESTAMP) AS changed_at, _ingested_at
# MAGIC FROM bronze.status_history
# MAGIC WHERE _ingested_at > history_until
# MAGIC QUALIFY row_number() OVER (PARTITION BY id ORDER BY _ingested_at DESC) = 1;
# MAGIC
# MAGIC MERGE INTO silver.status_history AS t
# MAGIC USING history_batch AS s
# MAGIC ON t.id = s.id
# MAGIC WHEN NOT MATCHED THEN INSERT (
# MAGIC   id, occurrence_id, from_status, to_status, note, reason, changed_by, changed_by_role,
# MAGIC   changed_at, _ingested_at
# MAGIC ) VALUES (
# MAGIC   s.id, s.occurrence_id, s.from_status, s.to_status, s.note, s.reason, s.changed_by,
# MAGIC   s.changed_by_role, s.changed_at, s._ingested_at
# MAGIC );
# MAGIC
# MAGIC MERGE INTO silver.status_history AS t
# MAGIC USING (
# MAGIC   SELECT id,
# MAGIC          CAST(row_number() OVER w AS INT) AS ordem,
# MAGIC          lead(changed_at) OVER w AS ate,
# MAGIC          (unix_millis(lead(changed_at) OVER w) - unix_millis(changed_at)) / 3600000.0 AS horas_no_estado
# MAGIC   FROM silver.status_history
# MAGIC   -- Occurrences with new events, and any event still without an order (self-healing).
# MAGIC   WHERE occurrence_id IN (SELECT occurrence_id FROM history_batch)
# MAGIC      OR occurrence_id IN (SELECT occurrence_id FROM silver.status_history WHERE ordem IS NULL)
# MAGIC   WINDOW w AS (PARTITION BY occurrence_id ORDER BY changed_at, id)
# MAGIC ) AS s
# MAGIC ON t.id = s.id
# MAGIC WHEN MATCHED AND (t.ordem IS DISTINCT FROM s.ordem OR t.ate IS DISTINCT FROM s.ate) THEN
# MAGIC   UPDATE SET ordem = s.ordem, ate = s.ate, horas_no_estado = s.horas_no_estado

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ocorrências
# MAGIC
# MAGIC As datas são guardadas em UTC; o dia de criação e de resolução calcula-se em `Europe/Lisbon`,
# MAGIC como na base operacional. A célula H3 (`h3_longlatash3`, resolução 9) agrupa pontos vizinhos
# MAGIC para os mapas de calor.

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Already processed: merged into silver or sent to quarantine (fixed before writing, see above).
# MAGIC DECLARE OR REPLACE VARIABLE occurrences_until TIMESTAMP;
# MAGIC SET VAR occurrences_until = greatest(
# MAGIC   (SELECT coalesce(max(_ingested_at), TIMESTAMP '1970-01-01') FROM silver.occurrences),
# MAGIC   (SELECT coalesce(max(_ingested_at), TIMESTAMP '1970-01-01') FROM silver.occurrences_quarentena));
# MAGIC
# MAGIC CREATE OR REPLACE TEMP VIEW occurrences_batch AS
# MAGIC WITH latest AS (
# MAGIC   SELECT *
# MAGIC   FROM bronze.occurrences
# MAGIC   WHERE _ingested_at > occurrences_until
# MAGIC   QUALIFY row_number() OVER (PARTITION BY id ORDER BY updated_at DESC, _ingested_at DESC) = 1
# MAGIC ),
# MAGIC typed AS (
# MAGIC   SELECT CAST(id AS STRING) AS id, reference, CAST(citizen_id AS STRING) AS citizen_id,
# MAGIC          CAST(category_id AS STRING) AS category_id, category_slug, category_name, status,
# MAGIC          CAST(lat AS DOUBLE) AS lat, CAST(lng AS DOUBLE) AS lng, address,
# MAGIC          coalesce(CAST(has_photo AS BOOLEAN), false) AS has_photo,
# MAGIC          CAST(original_id AS STRING) AS original_id, rejection_reason,
# MAGIC          CAST(created_at AS TIMESTAMP) AS created_at, CAST(updated_at AS TIMESTAMP) AS updated_at,
# MAGIC          CAST(resolved_at AS TIMESTAMP) AS resolved_at,
# MAGIC          CAST(cancelled_at AS TIMESTAMP) AS cancelled_at,
# MAGIC          _ingested_at, _source_file
# MAGIC   FROM latest
# MAGIC ),
# MAGIC derived AS (
# MAGIC   SELECT *,
# MAGIC          CASE WHEN status IN ('RESOLVIDA', 'REJEITADA', 'DUPLICADA', 'ANULADA')
# MAGIC               THEN coalesce(resolved_at, cancelled_at, updated_at) END AS closed_at
# MAGIC   FROM typed
# MAGIC )
# MAGIC SELECT d.*,
# MAGIC        CASE
# MAGIC          WHEN id IS NULL OR reference IS NULL OR citizen_id IS NULL OR category_slug IS NULL
# MAGIC               OR status IS NULL OR created_at IS NULL OR updated_at IS NULL
# MAGIC            THEN 'campos obrigatórios em falta'
# MAGIC          WHEN status NOT IN ('RECEBIDA', 'EM_ANALISE', 'EM_RESOLUCAO', 'RESOLVIDA', 'REJEITADA',
# MAGIC                              'DUPLICADA', 'ANULADA')
# MAGIC            THEN 'estado desconhecido'
# MAGIC          WHEN reference NOT RLIKE '^SIN-[0-9]{4}-[0-9]{5,}$' THEN 'referência inválida'
# MAGIC          WHEN lat IS NULL OR lng IS NULL OR NOT (lat BETWEEN 41.40 AND 41.67 AND lng BETWEEN -8.76 AND -8.48)
# MAGIC            THEN 'coordenadas fora de Barcelos'
# MAGIC          WHEN updated_at < created_at OR resolved_at < created_at OR cancelled_at < created_at
# MAGIC            THEN 'datas incoerentes'
# MAGIC          WHEN (status = 'RESOLVIDA') <> (resolved_at IS NOT NULL) THEN 'resolvida sem data'
# MAGIC        END AS motivo
# MAGIC FROM derived d;
# MAGIC
# MAGIC INSERT INTO silver.occurrences_quarentena
# MAGIC SELECT id, reference, motivo, to_json(struct(*)) AS registo, _source_file, _ingested_at,
# MAGIC        current_timestamp()
# MAGIC FROM occurrences_batch
# MAGIC WHERE motivo IS NOT NULL;
# MAGIC
# MAGIC MERGE INTO silver.occurrences AS t
# MAGIC USING (
# MAGIC   SELECT id, reference, citizen_id, category_id, category_slug, category_name, status, lat, lng,
# MAGIC          h3_longlatash3(lng, lat, 9) AS h3_cell,
# MAGIC          address, has_photo, original_id, rejection_reason, created_at, updated_at,
# MAGIC          resolved_at, cancelled_at, closed_at,
# MAGIC          to_date(from_utc_timestamp(created_at, 'Europe/Lisbon')) AS created_date,
# MAGIC          to_date(from_utc_timestamp(resolved_at, 'Europe/Lisbon')) AS resolved_date,
# MAGIC          to_date(from_utc_timestamp(closed_at, 'Europe/Lisbon')) AS closed_date,
# MAGIC          (unix_millis(resolved_at) - unix_millis(created_at)) / 86400000.0 AS resolution_days,
# MAGIC          _ingested_at, _source_file
# MAGIC   FROM occurrences_batch
# MAGIC   WHERE motivo IS NULL
# MAGIC ) AS s
# MAGIC ON t.id = s.id
# MAGIC WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE SET *
# MAGIC WHEN NOT MATCHED THEN INSERT *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Verificação

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT
# MAGIC   (SELECT count(*) FROM silver.occurrences) AS ocorrencias,
# MAGIC   (SELECT count(DISTINCT id) FROM silver.occurrences) AS ids_distintos,
# MAGIC   (SELECT count(*) FROM silver.status_history) AS eventos,
# MAGIC   (SELECT count(*) FROM silver.categories) AS categorias,
# MAGIC   (SELECT count(*) FROM silver.occurrences_quarentena) AS em_quarentena

# COMMAND ----------

# MAGIC %md
# MAGIC Com o **Change Data Feed** vê-se o que a última escrita alterou (inserções, e o antes e depois
# MAGIC de cada atualização), sem comparar a tabela inteira.

# COMMAND ----------

last_version = spark.sql("DESCRIBE HISTORY silver.occurrences LIMIT 1").first()["version"]
display(
    spark.sql(
        "SELECT _change_type, count(*) AS linhas "
        "FROM table_changes('silver.occurrences', :version) GROUP BY _change_type",
        args={"version": last_version},
    )
)
