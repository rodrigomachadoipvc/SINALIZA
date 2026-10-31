# Sinaliza — app mobile (cidadão)

App Expo (SDK 58, Expo Router) para o cidadão reportar e acompanhar ocorrências. Corre no
**Expo Go**, sem _development build_.

## Configurar o endereço da API

A app lê o gateway de `EXPO_PUBLIC_API_URL` (o Expo copia o valor para o bundle ao arrancar):

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

- **Telemóvel com Expo Go:** use o IP do computador na rede local, por exemplo
  `EXPO_PUBLIC_API_URL=http://192.168.1.50:8080/api`. `localhost` seria o próprio telemóvel.
  O computador e o telemóvel têm de estar na mesma rede, e a firewall tem de aceitar a porta 8080.
- **Emulador Android:** `http://10.0.2.2:8080/api`.
- **Browser (build web, só para verificação):** `http://localhost:8080/api` (valor por omissão).

Depois de mudar o `.env`, reinicie o Expo com `--clear`.

## Comandos

```bash
docker compose up -d --build --wait     # API completa em :8080 (na raiz do repositório)
pnpm --filter mobile start              # Metro + QR code para o Expo Go
pnpm --filter mobile web                # build web em http://localhost:8082 (verificação)
pnpm --filter mobile typecheck
pnpm --filter mobile lint
pnpm --filter mobile test               # Jest + Testing Library (API simulada)
```

## Estrutura

- `src/app/` — ecrãs (Expo Router): `(auth)` login/registo/recuperar, `(tabs)` mapa/minhas/perfil,
  `reportar/` o assistente de 4 passos.
- `src/api/` — cliente axios (token, renovação automática, mensagens de erro) e queries.
- `src/store/draft.ts` — rascunho da ocorrência (zustand), que sobrevive a erros de envio.
- `src/map/` — `SinalizaMap` com `react-native-maps` + mosaicos OSM; a versão `.web.tsx` usa
  Leaflet. Os dois agrupam os pinos com `supercluster` (`cluster.ts`) e o ecrã do mapa só pede
  as ocorrências da área visível (D42).
- `src/i18n/pt-PT.ts` — todos os textos.
