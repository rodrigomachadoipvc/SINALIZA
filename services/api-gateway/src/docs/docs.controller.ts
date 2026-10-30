import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiExcludeController, type OpenAPIObject } from '@nestjs/swagger';
import { notFound, Public } from '@sinaliza/service-kit';

import { SERVICE_NAMES, type ServiceName } from '../config.js';
import { DocsService } from './docs.service.js';

export const DOCS_ASSETS_PREFIX = '/docs/assets';

const LABELS: Record<ServiceName, string> = {
  identity: 'identity-service · contas e autenticação',
  municipal: 'municipal-service · categorias e município',
  occurrence: 'occurrence-service · ocorrências, mapa e estatísticas',
  notification: 'notification-service · emails (só eventos)',
};

const PAGE = `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sinaliza · API</title>
<link rel="stylesheet" href="${DOCS_ASSETS_PREFIX}/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="${DOCS_ASSETS_PREFIX}/swagger-ui-bundle.js"></script>
<script src="${DOCS_ASSETS_PREFIX}/swagger-ui-standalone-preset.js"></script>
<script src="/docs/init.js"></script>
</body>
</html>
`;

const SPEC_URLS = SERVICE_NAMES.map((name) => ({
  name: LABELS[name],
  url: `/docs/specs/${name}.json`,
}));

// A separate file instead of an inline script, so the Content-Security-Policy stays strict.
const INIT = `window.ui = SwaggerUIBundle({
  urls: ${JSON.stringify(SPEC_URLS)},
  'urls.primaryName': ${JSON.stringify(LABELS.occurrence)},
  dom_id: '#swagger-ui',
  deepLinking: true,
  persistAuthorization: true,
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
  layout: 'StandaloneLayout',
});
`;

const isServiceName = (value: string): value is ServiceName =>
  (SERVICE_NAMES as readonly string[]).includes(value);

/** Swagger UI with a selector for the four service specs, all callable through the gateway. */
@ApiExcludeController()
@Public()
@Controller('docs')
export class DocsController {
  constructor(private readonly docs: DocsService) {}

  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  page(): string {
    return PAGE;
  }

  @Get('init.js')
  @Header('content-type', 'application/javascript; charset=utf-8')
  init(): string {
    return INIT;
  }

  @Get('specs/:file')
  async spec(@Param('file') file: string): Promise<OpenAPIObject> {
    const service = file.replace(/\.json$/, '');
    if (!isServiceName(service)) throw notFound('Esta documentação não existe.');
    const spec = await this.docs.spec(service);
    if (!spec) throw notFound('A documentação deste serviço não está disponível de momento.');
    return spec;
  }
}
