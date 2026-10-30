#!/bin/sh
# Runs once, on the first start of an empty data volume.
# Creates one database and one login role per service (RNF07): each role owns only its database
# and PUBLIC loses CONNECT, so a service cannot open another service's database.
set -eu

create_db() {
  db="$1"
  user="$2"
  password="$3"
  with_postgis="$4"

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -v db="$db" -v usr="$user" -v pwd="$password" <<'SQL'
CREATE ROLE :"usr" LOGIN PASSWORD :'pwd';
CREATE DATABASE :"db" OWNER :"usr";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db" TO :"usr";
SQL

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" -v usr="$user" <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO :"usr";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL

  if [ "$with_postgis" = "yes" ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" \
      -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
  fi

  echo "created database $db (owner $user, postgis=$with_postgis)"
}

create_db identity_db "$IDENTITY_DB_USER" "$IDENTITY_DB_PASSWORD" no
create_db occurrence_db "$OCCURRENCE_DB_USER" "$OCCURRENCE_DB_PASSWORD" yes
create_db municipal_db "$MUNICIPAL_DB_USER" "$MUNICIPAL_DB_PASSWORD" yes

# The image's own template databases are not needed by the services.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
SQL
