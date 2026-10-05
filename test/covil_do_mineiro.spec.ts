import pactum from 'pactum';
import { StatusCodes } from 'http-status-codes';
import { SimpleReporter } from '../simple-reporter';
import { faker } from '@faker-js/faker';

/**
 * API pública da Atlética Covil do Mineiro (ambiente de homologação).
 * Documentação: https://homolog.atleticacovildomineiro.com.br/rotas
 */
describe('API pública Covil do Mineiro', () => {
  const p = pactum;
  const rep = SimpleReporter;
  const baseUrl = 'https://homolog.atleticacovildomineiro.com.br/api';

  // Corpo válido de cadastro; cada cenário quebra só um campo.
  const novoUsuario = () => ({
    nome: faker.person.fullName(),
    email: faker.internet.email().toLowerCase(),
    password: faker.internet.password({ length: 10, prefix: 'Aa1' }),
    telefone: `489${faker.string.numeric(8)}`,
    aceiteTermos: true
  });

  // Conta de teste já confirmada no ambiente de homologação.
  const emailValido = 'gabrielmzavarize@gmail.com';
  const senhaValida = 'predacao3185.';

  let token = '';
  let slugProduto = '';
  let slugEvento = '';

  const schemaErro = {
    type: 'object',
    properties: {
      message: { type: 'string' },
      campo: { type: 'string' }
    },
    required: ['message']
  };

  p.request.setDefaultTimeout(60000);

  beforeAll(() => p.reporter.add(rep));

  afterAll(() => p.reporter.end());

  describe('Cadastro de usuário', () => {
    it('Não deve cadastrar usuário com e-mail em formato inválido', async () => {
      await p
        .spec()
        .post(`${baseUrl}/usuarios`)
        .withJson({ ...novoUsuario(), email: 'email-invalido' })
        .expectStatus(StatusCodes.BAD_REQUEST)
        .expectJson({ message: 'E-mail inválido.', campo: 'email' });
    });

    it('Não deve cadastrar usuário com telefone sem DDD', async () => {
      await p
        .spec()
        .post(`${baseUrl}/usuarios`)
        .withJson({ ...novoUsuario(), telefone: '99999' })
        .expectStatus(StatusCodes.BAD_REQUEST)
        .expectJsonSchema(schemaErro)
        .expectJson({
          message:
            'Telefone inválido. Informe DDD + número, ex.: (48) 99999-8888.',
          campo: 'telefone'
        });
    });

    it('Não deve cadastrar usuário sem aceitar os Termos de Uso', async () => {
      await p
        .spec()
        .post(`${baseUrl}/usuarios`)
        .withJson({ ...novoUsuario(), aceiteTermos: false })
        .expectStatus(StatusCodes.BAD_REQUEST)
        .expectJson({
          message:
            'É obrigatório aceitar os Termos de Uso (aceiteTermos: true).',
          campo: 'aceiteTermos'
        });
    });

    it('Não deve cadastrar usuário com senha menor que 6 caracteres', async () => {
      await p
        .spec()
        .post(`${baseUrl}/usuarios`)
        .withJson({ ...novoUsuario(), password: faker.string.numeric(5) })
        .expectStatus(StatusCodes.BAD_REQUEST)
        .expectJson({
          message: 'A senha deve ter entre 6 e 72 caracteres.',
          campo: 'password'
        });
    });
  });

  describe('Login', () => {
    it('Não deve logar sem informar a senha', async () => {
      await p
        .spec()
        .post(`${baseUrl}/login`)
        .withJson({ email: faker.internet.email() })
        .expectStatus(StatusCodes.BAD_REQUEST)
        .expectJson({ message: 'Informe email e password.', campo: 'password' });
    });

    it('Não deve logar com e-mail e senha inválidos', async () => {
      await p
        .spec()
        .post(`${baseUrl}/login`)
        .withJson({
          email: faker.internet.email().toLowerCase(),
          password: faker.string.alphanumeric(10)
        })
        .expectStatus(StatusCodes.UNAUTHORIZED)
        .expectBodyContains('E-mail e/ou senha inválidos');
    });
  });

  describe('Meu perfil', () => {
    it('Não deve retornar o perfil sem o header Authorization', async () => {
      await p
        .spec()
        .get(`${baseUrl}/usuarios/me`)
        .expectStatus(StatusCodes.UNAUTHORIZED)
        .expectJson({ message: 'Token de acesso ausente, inválido ou expirado.' });
    });

    it('Não deve retornar o perfil com token inválido', async () => {
      await p
        .spec()
        .get(`${baseUrl}/usuarios/me`)
        .withHeaders('Authorization', `Bearer ${faker.string.alphanumeric(40)}`)
        .expectStatus(StatusCodes.UNAUTHORIZED)
        .expectBodyContains('Token de acesso ausente, inválido ou expirado');
    });
  });

  describe('Usuário logado', () => {
    beforeEach(async () => {
      token = await p
        .spec()
        .post(`${baseUrl}/login`)
        .withJson({
          email: emailValido,
          password: senhaValida
        })
        .expectStatus(StatusCodes.OK)
        .expectBodyContains('Login realizado com sucesso')
        .returns('authorization');
    });

    it('Deve logar com credenciais válidas e devolver um token Bearer', async () => {
      await p
        .spec()
        .post(`${baseUrl}/login`)
        .withJson({
          email: emailValido,
          password: senhaValida
        })
        .expectStatus(StatusCodes.OK)
        .expectJsonLike({
          message: 'Login realizado com sucesso',
          usuario: { email: emailValido }
        })
        .expectJsonSchema({
          type: 'object',
          properties: {
            message: { type: 'string' },
            authorization: { type: 'string', pattern: '^Bearer ' },
            expiraEm: { type: 'integer' },
            usuario: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' }
              },
              required: ['id', 'email']
            }
          },
          required: ['message', 'authorization', 'expiraEm', 'usuario']
        });
    });

    it('Deve retornar o perfil do dono do token', async () => {
      await p
        .spec()
        .get(`${baseUrl}/usuarios/me`)
        .withHeaders('Authorization', token)
        .expectStatus(StatusCodes.OK)
        .expectJsonLike({ email: emailValido })
        .expectJsonSchema({
          type: 'object',
          properties: {
            id: { type: 'string' },
            nome: { type: 'string' },
            email: { type: 'string' },
            telefone: { type: 'string' },
            socio: { type: 'boolean' },
            criadoEm: { type: 'string' }
          },
          required: ['id', 'nome', 'email', 'telefone', 'socio', 'criadoEm']
        });
    });

    it('Não deve cadastrar novamente um e-mail já existente', async () => {
      await p
        .spec()
        .post(`${baseUrl}/usuarios`)
        .withJson({ ...novoUsuario(), email: emailValido })
        .expectStatus(StatusCodes.CONFLICT)
        .expectJson({ message: 'Este e-mail já está cadastrado.' });
    });
  });

  describe('Produtos', () => {
    it('Deve listar os produtos publicados na loja', async () => {
      slugProduto = await p
        .spec()
        .get(`${baseUrl}/produtos`)
        .expectStatus(StatusCodes.OK)
        .expectHeaderContains('content-type', 'application/json')
        .expectJsonSchema({
          type: 'object',
          properties: {
            quantidade: { type: 'integer' },
            produtos: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  slug: { type: 'string' },
                  nome: { type: 'string' },
                  descricao: { type: 'string' },
                  preco: { type: 'number' },
                  categoria: { type: 'string' },
                  imagem: { type: 'string' },
                  esgotado: { type: 'boolean' },
                  url: { type: 'string' }
                },
                required: [
                  'id',
                  'slug',
                  'nome',
                  'descricao',
                  'preco',
                  'categoria',
                  'imagem',
                  'esgotado',
                  'url'
                ]
              }
            }
          },
          required: ['quantidade', 'produtos']
        })
        .returns('produtos[0].slug');
    });

    it('Deve buscar um produto pelo slug retornado na listagem', async () => {
      await p
        .spec()
        .get(`${baseUrl}/produtos/{slug}`)
        .withPathParams('slug', slugProduto)
        .expectStatus(StatusCodes.OK)
        .expectJsonLike({ slug: slugProduto });
    });

    it('Deve retornar 404 ao buscar produto inexistente', async () => {
      await p
        .spec()
        .get(`${baseUrl}/produtos/{slug}`)
        .withPathParams('slug', faker.string.uuid())
        .expectStatus(StatusCodes.NOT_FOUND)
        .expectJson({ message: 'Produto não encontrado.' });
    });
  });

  describe('Eventos', () => {
    it('Deve listar os eventos publicados', async () => {
      slugEvento = await p
        .spec()
        .get(`${baseUrl}/eventos`)
        .expectStatus(StatusCodes.OK)
        .expectJsonSchema({
          type: 'object',
          properties: {
            quantidade: { type: 'integer' },
            eventos: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  slug: { type: 'string' },
                  nome: { type: 'string' },
                  data: { type: 'string' },
                  local: { type: 'string' },
                  precoAPartirDe: { type: 'number' },
                  status: { type: 'string' }
                },
                required: [
                  'id',
                  'slug',
                  'nome',
                  'data',
                  'local',
                  'precoAPartirDe',
                  'status'
                ]
              }
            }
          },
          required: ['quantidade', 'eventos']
        })
        .returns('eventos[0].slug');
    });

    it('Deve buscar um evento pelo slug retornado na listagem', async () => {
      await p
        .spec()
        .get(`${baseUrl}/eventos/{slug}`)
        .withPathParams('slug', slugEvento)
        .expectStatus(StatusCodes.OK)
        .expectJsonLike({ slug: slugEvento });
    });

    it('Deve retornar 404 ao buscar evento inexistente', async () => {
      await p
        .spec()
        .get(`${baseUrl}/eventos/{slug}`)
        .withPathParams('slug', faker.string.uuid())
        .expectStatus(StatusCodes.NOT_FOUND)
        .expectJson({ message: 'Evento não encontrado.' });
    });
  });
});
