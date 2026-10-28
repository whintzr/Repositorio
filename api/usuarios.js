// Gestão de contas. Listar exige login; criar, excluir e trocar senha de outros exige administrador.
import crypto from 'node:crypto';
import { lerUsuarios, gravarUsuarios, criarHash, conferirSenha, exigirLogin, responder, corpoJson } from './_lib.js';

const publico = u => ({id:u.id, nome:u.nome, usuario:u.usuario, admin:!!u.admin, criadoEm:u.criadoEm});
const normalizar = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');

export default async function handler(req, res){
  const url = new URL(req.url, 'http://x');
  const acao = (req.query && req.query.action) || url.searchParams.get('action');
  const eu = await exigirLogin(req, res);
  if (!eu) return;
  const somenteAdmin = () => {
    if (eu.admin) return true;
    responder(res, 403, {erro:'Apenas o administrador pode fazer isso.'});
    return false;
  };

  try {
    if (acao === 'listar'){
      const usuarios = await lerUsuarios();
      return responder(res, 200, {usuarios: usuarios.map(publico)});
    }

    if (acao === 'criar'){
      if (!somenteAdmin()) return;
      const {nome, usuario, senha, admin} = await corpoJson(req);
      const login = normalizar(usuario);
      if (!nome || !login || !senha) return responder(res, 400, {erro:'Preencha nome, usuário e senha.'});
      if (String(senha).length < 6) return responder(res, 400, {erro:'A senha precisa ter pelo menos 6 caracteres.'});
      const usuarios = await lerUsuarios();
      if (usuarios.some(u => u.usuario === login)) return responder(res, 409, {erro:'Já existe alguém com esse usuário.'});
      const novo = {id:crypto.randomUUID(), nome:String(nome).trim(), usuario:login, admin:!!admin, criadoEm:Date.now(), ...criarHash(String(senha))};
      usuarios.push(novo);
      await gravarUsuarios(usuarios);
      return responder(res, 200, {usuario: publico(novo)});
    }

    if (acao === 'excluir'){
      if (!somenteAdmin()) return;
      const {id} = await corpoJson(req);
      if (id === eu.id) return responder(res, 400, {erro:'Você não pode excluir a própria conta.'});
      const usuarios = await lerUsuarios();
      const restantes = usuarios.filter(u => u.id !== id);
      if (restantes.length === usuarios.length) return responder(res, 404, {erro:'Conta não encontrada.'});
      if (!restantes.some(u => u.admin)) return responder(res, 400, {erro:'O sistema precisa de pelo menos um administrador.'});
      await gravarUsuarios(restantes);
      return responder(res, 200, {ok:true});
    }

    if (acao === 'senha'){
      const {id, atual, nova} = await corpoJson(req);
      const alvo = id || eu.id;
      if (alvo !== eu.id && !somenteAdmin()) return;
      if (String(nova || '').length < 6) return responder(res, 400, {erro:'A nova senha precisa ter pelo menos 6 caracteres.'});
      const usuarios = await lerUsuarios();
      const conta = usuarios.find(u => u.id === alvo);
      if (!conta) return responder(res, 404, {erro:'Conta não encontrada.'});
      if (alvo === eu.id && !conferirSenha(String(atual || ''), conta)) return responder(res, 401, {erro:'Senha atual incorreta.'});
      Object.assign(conta, criarHash(String(nova)));
      await gravarUsuarios(usuarios);
      return responder(res, 200, {ok:true});
    }

    return responder(res, 404, {erro:'Ação desconhecida.'});
  } catch(e){
    console.error(e);
    return responder(res, 500, {erro:'Erro no servidor: ' + e.message});
  }
}
