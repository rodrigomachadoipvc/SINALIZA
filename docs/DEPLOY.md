# Sinaliza · Instalação na cloud

Passo a passo para pôr o Sinaliza a correr numa máquina virtual Linux com Docker (por exemplo
uma VM do **Azure for Students** ou qualquer outra VPS), com HTTPS automático.

```
              Internet (80, 443)
                     │
                   Caddy ── TLS automático (Let's Encrypt / ZeroSSL)
       ┌─────────────┼───────────────────┐
api.<domínio>  backoffice.<domínio>  ficheiros.<domínio>
       │             │                   │
  api-gateway    backoffice (nginx)   storage (S3, só GETs assinados)
       │
  identity · occurrence · municipal · notification ── PostgreSQL/PostGIS, RabbitMQ
                                                       (só na rede interna do Docker)
```

A configuração cloud é o `docker-compose.yml` local mais o _override_ `docker-compose.cloud.yml`:

| O quê                               | Local                    | Cloud                                                       |
| ----------------------------------- | ------------------------ | ----------------------------------------------------------- |
| Entrada                             | `:8080` (API), `:8081`   | só **Caddy** em 80/443, com HTTPS                           |
| PostgreSQL, RabbitMQ UI, consola S3 | portas abertas no _host_ | só em `127.0.0.1` da VM (acesso por túnel SSH)              |
| Endereços públicos                  | `localhost`              | derivados de `SINALIZA_DOMAIN`                              |
| Email                               | Mailpit                  | SMTP real (Mailtrap ou SendGrid); o Mailpit não arranca     |
| Gateway                             | `TRUST_PROXY=false`      | confia no Caddy, para o _rate limit_ contar o IP do cliente |

## 1. Máquina virtual

- **Ubuntu Server 24.04 LTS**, 2 vCPU e 4 GB de RAM (no Azure: _Standard B2s_). Com 2 GB a
  compilação das imagens fica muito lenta.
- 30 GB de disco.
- **Portas de entrada:** 22 (SSH), 80 e 443 (TCP) e 443 (UDP, HTTP/3). No Azure, acrescente-as no
  _Network security group_ da VM; não abra mais nenhuma.
- Autenticação SSH só por chave.

Instale o Docker Engine com o plugin Compose seguindo a
[documentação oficial](https://docs.docker.com/engine/install/ubuntu/) e dê ao seu utilizador
acesso ao Docker:

```bash
sudo usermod -aG docker "$USER"   # volte a entrar por SSH para ter efeito
docker compose version            # 2.24 ou mais recente (usa !override e !reset)
```

Atualizações de segurança automáticas do sistema:

```bash
sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
```

## 2. Domínio

São precisos três nomes a apontar para o IP público da VM: `api.`, `backoffice.` e `ficheiros.`.

- **Sem domínio próprio:** use o [sslip.io](https://sslip.io), que resolve qualquer nome com o IP
  lá dentro. Com o IP `20.10.30.40`, `SINALIZA_DOMAIN=20.10.30.40.sslip.io` dá
  `api.20.10.30.40.sslip.io`, etc. Não é preciso configurar nada.
- **Com domínio próprio:** crie três registos `A` (ou um `*.sinaliza.exemplo.pt`) para o IP.

O IP tem de ser **estático** (no Azure: _Public IP address → Configuration → Static_); se mudar,
os nomes do sslip.io mudam também.

## 3. Código e chaves

```bash
sudo mkdir -p /opt/sinaliza && sudo chown "$USER" /opt/sinaliza
git clone https://github.com/rodrigomachadoipvc/SINALIZA.git /opt/sinaliza
cd /opt/sinaliza
sh scripts/gerar-chaves.sh        # par RSA do JWT em infra/keys (nunca no Git)
```

## 4. `.env` de produção

```bash
cp .env.example .env
chmod 600 .env
```

Mude **todas** as palavras-passe e segredos; gere cada um com `openssl rand -hex 24`:

| Variável                                                                  | Nota                                    |
| ------------------------------------------------------------------------- | --------------------------------------- |
| `POSTGRES_PASSWORD`                                                       | superutilizador, só para admin e backup |
| `IDENTITY_DB_PASSWORD`, `OCCURRENCE_DB_PASSWORD`, `MUNICIPAL_DB_PASSWORD` | um utilizador por base (RNF07)          |
| `RABBITMQ_PASSWORD`                                                       |                                         |
| `S3_SECRET_KEY`                                                           | armazenamento das fotografias           |
| `INTERNAL_API_TOKEN`                                                      | chamadas serviço a serviço              |

Os valores de `*_DB_PASSWORD` só são lidos na **primeira** vez que o PostgreSQL arranca (o
script de _init_ cria os utilizadores). Para os mudar depois é preciso `ALTER ROLE` na base.

Acrescente a parte da cloud:

```bash
# Usa sempre os dois ficheiros: docker compose up, exec, logs, o script de backup...
COMPOSE_FILE=docker-compose.yml:docker-compose.cloud.yml
SINALIZA_DOMAIN=20.10.30.40.sslip.io
# Email para os avisos dos certificados (Let's Encrypt).
ACME_EMAIL=o-seu-email@exemplo.pt
```

Não precisa de definir `CORS_ORIGINS`, `PASSWORD_RESET_URL`, `S3_PUBLIC_ENDPOINT` nem
`BACKOFFICE_API_URL`: o _override_ calcula-os a partir de `SINALIZA_DOMAIN`.

### Email (SMTP real)

O `notification-service` envia por SMTP com STARTTLS na porta 587 (`SMTP_SECURE=false`; use
`true` só na porta 465). O remetente de `MAIL_FROM` tem de estar verificado no fornecedor.

**Mailtrap** (recomendado; [documentação](https://docs.mailtrap.io/email-api-smtp/setup/smtp-integration)):
verifique o domínio em _Sending Domains_ e copie as credenciais do separador SMTP.

```bash
SMTP_HOST=live.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=api
SMTP_PASSWORD=<token da API do Mailtrap>
MAIL_FROM="Sinaliza <nao-responder@o-seu-dominio.pt>"
```

**SendGrid** (o plano gratuito passou a ser um período de teste; confirme as condições atuais):
crie uma _API key_ com permissão _Mail Send_ e verifique o remetente (_Sender Authentication_).

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=<API key do SendGrid>
```

Muitas clouds (o Azure incluído) bloqueiam a porta 25 de saída; a 587 funciona.

### Dashboard via Databricks (opcional)

Por omissão o dashboard lê a base operacional. Para usar o lakehouse, preencha
`ANALYTICS_SOURCE=databricks`, `DATABRICKS_HOST`, `DATABRICKS_TOKEN` e `DATABRICKS_WAREHOUSE_ID`
(ver [`analytics/README.md`](../analytics/README.md)). O export para o volume pode correr na
própria VM (o PostgreSQL está em `127.0.0.1:5432`) com um `cron` diário antes do job.

## 5. Arrancar

```bash
docker compose up -d --build --wait
docker compose ps
```

A primeira compilação demora alguns minutos. O Caddy pede os certificados no primeiro arranque;
acompanhe com `docker compose logs -f caddy` (procure `certificate obtained successfully`).

Verifique:

```bash
curl -fsS https://api.$SINALIZA_DOMAIN/health          # {"status":"ok",...}
curl -sI http://api.$SINALIZA_DOMAIN/health | head -1  # 308: HTTP redireciona para HTTPS
```

e abra `https://backoffice.<domínio>` e `https://api.<domínio>/docs` (Swagger).

### Dados iniciais

O `municipal-service` cria as categorias por omissão e carrega o limite de Barcelos ao arrancar.
As contas e as ocorrências de demonstração são opcionais:

```bash
docker compose exec -T identity-service node dist/seed.js
docker compose exec -T -e SEED_API_URL=http://api-gateway:8080/api occurrence-service node dist/seed.js
```

As palavras-passe das contas de demonstração estão no repositório público. Se fizer o _seed_ numa
máquina acessível da Internet, **mude-as logo** (backoffice → _Perfil_ → _Alterar palavra-passe_),
ou desative os gestores que não usar (_Gestores_).

## 6. App mobile

Na máquina onde corre o Expo, aponte a app para o gateway público e reinicie com `--clear`:

```bash
# apps/mobile/.env
EXPO_PUBLIC_API_URL=https://api.20.10.30.40.sslip.io/api
```

O telemóvel já não precisa de estar na mesma rede que o computador.

## 7. Consolas de administração (túnel SSH)

PostgreSQL, a consola do RabbitMQ e a do armazenamento só escutam em `127.0.0.1` da VM. Abra um
túnel a partir do seu computador:

```bash
ssh -N -L 15672:127.0.0.1:15672 -L 9001:127.0.0.1:9001 -L 5432:127.0.0.1:5432 utilizador@20.10.30.40
```

e use `http://localhost:15672` (RabbitMQ, incluindo a DLQ `notification.emails.dlq`),
`http://localhost:9001` (armazenamento) e `psql -h localhost -U sinaliza_admin postgres`. Se o
seu computador já tiver essas portas ocupadas (por exemplo pela stack local), troque o primeiro
número.

## 8. Cópias de segurança do PostgreSQL

`scripts/backup-postgres.sh` faz um `pg_dump` comprimido (`-Fc`) de cada base (`identity_db`,
`occurrence_db`, `municipal_db`) para `backups/` e apaga os que têm mais de 14 dias
(`BACKUP_DIR` e `BACKUP_KEEP_DAYS` no `.env` mudam a pasta e o prazo).

Agende-o todos os dias às 03:30 com `crontab -e`:

```cron
30 3 * * * cd /opt/sinaliza && sh scripts/backup-postgres.sh >> backups/backup.log 2>&1
```

Uma cópia no mesmo disco não protege contra a perda da VM: copie a pasta para fora (por exemplo
com `rsync` para outra máquina, ou `azcopy` para um _Storage Account_). As fotografias estão no
volume Docker `sinaliza_storage-data`; inclua-o se precisar delas.

**Restaurar** uma base (pára os serviços que a usam, substitui o conteúdo e volta a arrancar):

```bash
docker compose stop occurrence-service
docker compose exec -T postgis sh -c 'pg_restore -U "$POSTGRES_USER" --clean --if-exists -d occurrence_db' \
  < backups/occurrence_db-20261031-033000.dump
docker compose start occurrence-service
```

Para só verificar uma cópia, restaure-a numa base temporária:

```bash
docker compose exec -T postgis sh -c 'createdb -U "$POSTGRES_USER" teste_restauro && pg_restore -U "$POSTGRES_USER" --no-owner -d teste_restauro && psql -U "$POSTGRES_USER" -d teste_restauro -c "select count(*) from occurrences" && dropdb -U "$POSTGRES_USER" teste_restauro' \
  < backups/occurrence_db-20261031-033000.dump
```

## 9. Atualizar

```bash
cd /opt/sinaliza
git pull
docker compose up -d --build --wait
```

As migrações correm no arranque de cada serviço. Faça uma cópia de segurança antes de atualizar.

## Problemas comuns

| Sintoma                                        | Causa provável                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `required variable SINALIZA_DOMAIN is missing` | falta `SINALIZA_DOMAIN`, `ACME_EMAIL`, `SMTP_HOST` ou `SMTP_PORT` no `.env`                                          |
| O Caddy não obtém certificados                 | portas 80/443 fechadas no _firewall_ da cloud, ou o nome não aponta para o IP da VM (`dig api.<domínio>`)            |
| O backoffice abre mas não entra                | `SINALIZA_DOMAIN` mudou depois do arranque: `docker compose up -d` recria o backoffice e o gateway com os novos URLs |
| As fotografias não aparecem                    | `S3_PUBLIC_ENDPOINT` foi definido à mão no `.env` com outro valor; retire-o                                          |
| Os emails não chegam                           | `docker compose logs notification-service`; mensagens que falharam todas as tentativas ficam na DLQ (túnel, §7)      |
| `429 Too Many Requests` para todos             | o gateway não está a confiar no Caddy; confirme que o _override_ está ativo (`COMPOSE_FILE`)                         |
