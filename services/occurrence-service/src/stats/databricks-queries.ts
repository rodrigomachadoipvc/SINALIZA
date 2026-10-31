// Queries sent to the Databricks SQL warehouse (catalog from DATABRICKS_CATALOG, schema `gold`).
// The same text is in analytics/notebooks/05_consultas_dashboard.py; a test in analytics/tests
// fails if they drift apart. Tables are built by analytics/notebooks/03_gold_indicadores.py.
// `:date_from` and `:date_to` are named parameters (DATE), never concatenated.

export const TOTALS_SQL = `
SELECT coalesce(sum(criadas), 0) AS total,
       coalesce(sum(criadas) FILTER (WHERE estado IN ('RECEBIDA', 'EM_ANALISE', 'EM_RESOLUCAO')), 0) AS abertas,
       coalesce(sum(criadas) FILTER (WHERE estado = 'REJEITADA'), 0) AS rejeitadas,
       coalesce(sum(criadas) FILTER (WHERE estado = 'DUPLICADA'), 0) AS duplicadas,
       coalesce(sum(resolvidas), 0) AS resolvidas,
       try_divide(sum(soma_dias_resolucao), sum(resolvidas)) AS media_dias,
       (SELECT max(atualizado_em) FROM kpi_diario) AS atualizado_em
FROM kpi_diario
WHERE dia BETWEEN :date_from AND :date_to`;

export const BY_STATUS_SQL = `
SELECT estado, sum(criadas) AS n
FROM kpi_diario
WHERE dia BETWEEN :date_from AND :date_to
GROUP BY estado
HAVING sum(criadas) > 0
ORDER BY n DESC, estado`;

export const BY_CATEGORY_SQL = `
SELECT categoria_slug, max(categoria_nome) AS categoria_nome, sum(criadas) AS n
FROM kpi_diario
WHERE dia BETWEEN :date_from AND :date_to
GROUP BY categoria_slug
HAVING sum(criadas) > 0
ORDER BY n DESC, categoria_slug`;

export const MONTHLY_SQL = `
SELECT date_format(dia, 'yyyy-MM') AS mes, sum(criadas) AS criadas, sum(resolvidas) AS resolvidas
FROM kpi_diario
WHERE dia BETWEEN :date_from AND :date_to
GROUP BY date_format(dia, 'yyyy-MM')
ORDER BY mes`;

export const RESOLUTION_SQL = `
SELECT categoria_slug, max(categoria_nome) AS categoria_nome, sum(resolvidas) AS resolvidas,
       sum(soma_dias_resolucao) / sum(resolvidas) AS media_dias
FROM kpi_diario
WHERE dia BETWEEN :date_from AND :date_to
GROUP BY categoria_slug
HAVING sum(resolvidas) > 0
ORDER BY media_dias DESC, categoria_slug`;

export const HOTSPOTS_SQL = `
SELECT lat, lng, sum(ocorrencias) AS n
FROM hotspots_h3
WHERE dia BETWEEN :date_from AND :date_to
GROUP BY h3_celula, lat, lng
ORDER BY n DESC, lat, lng
LIMIT 50`;
