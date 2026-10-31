import 'reflect-metadata';

import { Body, Controller, type INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Public } from '../auth/decorators.js';
import { configureApp, coreProviders } from '../bootstrap.js';

class NoteDto {
  @IsString()
  note!: string;
}

@Controller()
class EchoController {
  @Public()
  @Post('echo')
  echo(@Body() body: NoteDto): NoteDto {
    return body;
  }
}

// A JSON body whose «çã» is Latin-1 (0xE7 0xE3), as some Windows tools send it. Read as UTF-8 it
// used to become «��» and was stored like that.
const latin1Body = Buffer.concat([
  Buffer.from('{"note":"Verifica'),
  Buffer.from([0xe7, 0xe3]),
  Buffer.from('o"}'),
]);

describe('JSON bodies must be UTF-8', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EchoController],
      providers: coreProviders(null),
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { title: 'probe', description: 'probe' });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  // fetch sends the bytes as they are (supertest would serialise a Buffer as JSON).
  const post = async (body: Buffer) => {
    const res = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-utf8' },
      body: new Uint8Array(body),
    });
    return { status: res.status, body: (await res.json()) as unknown };
  };

  it('keeps accented text sent as UTF-8', async () => {
    const res = await post(Buffer.from('{"note":"Verificação"}'));
    expect(res).toEqual({ status: 201, body: { note: 'Verificação' } });
  });

  it('rejects a body that is not valid UTF-8 instead of storing «�»', async () => {
    const res = await post(latin1Body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'O pedido tem caracteres inválidos. Envie o texto codificado em UTF-8.',
      requestId: 'req-utf8',
    });
  });
});
