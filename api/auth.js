// Login, primeiro acesso e pareamento do celular.
import crypto from 'node:crypto';
import {
  lerUsuarios, gravarUsuarios, criarHash, conferirSenha, criarSessao, limparCookie,
  usuarioAtual, criarToken, abrirToken, registrarPareamento, responder, corpoJson
} from './_lib.js';

const publico = u => u && {id:u.id, nome:u.nome, usuario:u.usuario, admin:!!u.admin};
const normalizar = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');

export default async function handler(req, res){
  const acao = (req.query && req.query.action) || new URL(req.url, 'http://x').searchParams.get('action');
  try {
    if (acao === 'estado'){
      const usuarios = await lerUsuarios();
      return responder(res, 200, {instalado: usuarios.length > 0, usuario: publico(await usuarioAtual(req))});
    }

    if (acao === 'instalar'){
      const usuarios = await lerUsuarios();
      if (usuarios.length) return responder(res, 409, {erro:'O sistema já tem administrador.'});
      const {nome, usuario, senha} = await corpoJson(req);
      const login = normalizar(usuario);
      if (!nome || !login || !senha) return responder(res, 400, {erro:'Preencha nome, usuário e senha.'});
      if (String(senha).length < 6) return responder(res, 400, {erro:'A senha precisa ter pelo menos 6 caracteres.'});
      const novo = {id:crypto.randomUUID(), nome:String(nome).trim(), usuario:login, admin:true, criadoEm:Date.now(), ...criarHash(String(senha))};
      await gravarUsuarios([novo]);
      criarSessao(res, novo);
      return responder(res, 200, {usuario: publico(novo)});
    }

    if (acao === 'entrar'){
      const {usuario, senha} = await corpoJson(req);
      const usuarios = await lerUsuarios();
      const achado = usuarios.find(u => u.usuario === normalizar(usuario));
      if (!achado || !conferirSenha(String(senha || ''), achado)) return responder(res, 401, {erro:'Usuário ou senha incorretos.'});
      criarSessao(res, achado);
      return responder(res, 200, {usuario: publico(achado)});
    }

    if (acao === 'sair'){
      limparCookie(res);
      return responder(res, 200, {ok:true});
    }

    // gera o token que vira QR Code; vale 10 minutos e só pode ser usado uma vez
    if (acao === 'parear'){
      const u = await usuarioAtual(req);
      if (!u) return responder(res, 401, {erro:'Faça login para continuar.'});
      const duracao = 10 * 60 * 1000;
      const token = criarToken({uid:u.id, jti:crypto.randomUUID(), par:true}, duracao);
      const host = req.headers['x-forwarded-host'] || req.headers.host || '';
      const protocolo = req.headers['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https');
      const base = protocolo + '://' + host;
      return responder(res, 200, {url: base + '/?par=' + encodeURIComponent(token), expiraEm: Date.now() + duracao});
    }

    if (acao === 'resgatar'){
      const {token} = await corpoJson(req);
      const dados = abrirToken(token);
      if (!dados || !dados.par) return responder(res, 401, {erro:'Código expirado. Gere um novo QR Code no computador.'});
      if (!(await registrarPareamento(dados.jti))) return responder(res, 401, {erro:'Este QR Code já foi usado. Gere outro no computador.'});
      const usuarios = await lerUsuarios();
      const achado = usuarios.find(u => u.id === dados.uid);
      if (!achado) return responder(res, 401, {erro:'Usuário não encontrado.'});
      criarSessao(res, achado);
      return responder(res, 200, {usuario: publico(achado)});
    }

    return responder(res, 404, {erro:'Ação desconhecida.'});
  } catch(e){
    console.error(e);
    return responder(res, 500, {erro:'Erro no servidor: ' + e.message});
  }
}
