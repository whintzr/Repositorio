// Funções compartilhadas pelas rotas da API: armazenamento, sessão e usuários.
import crypto from 'node:crypto';
import { put, del, list, get, createFolder, issueSignedToken, presignUrl } from '@vercel/blob';

export const SECOES = [
  {id:'word',     dir:'Word',       exts:['.doc','.docx','.docm','.dot','.dotx','.rtf','.odt'], tipos:['POL','FF','FT','PR','IT','RG']},
  {id:'ppt',      dir:'PowerPoint', exts:['.ppt','.pptx','.pptm','.pps','.ppsx','.pot','.potx','.odp'], tipos:['Apresentação','Treinamento','Reunião','Relatório']},
  {id:'excel',    dir:'Excel',      exts:['.xls','.xlsx','.xlsm','.xlsb','.xlt','.xltx','.csv','.ods'], tipos:['Controle','Indicadores','Planilha','Relatório']},
  {id:'download', dir:'Download',   exts:null, tipos:[]}
];
export const RAIZ = 'arquivos/';
const META = 'sistema/meta.json';
const USUARIOS = 'sistema/usuarios.json';
const PAREAMENTOS = 'sistema/pareamentos.json';
const ACESSO = {access:'private'};

export const secaoPorId = id => SECOES.find(s => s.id === id);

/* ---------- JSON no armazenamento ---------- */
export async function lerJson(caminho, padrao){
  try {
    const r = await get(caminho, {access:'private', useCache:false});
    if (!r || r.statusCode !== 200) return padrao;
    return JSON.parse(await new Response(r.stream).text());
  } catch(e){ return padrao; }
}
export async function gravarJson(caminho, valor){
  await put(caminho, JSON.stringify(valor), {...ACESSO, addRandomSuffix:false, allowOverwrite:true, contentType:'application/json'});
}

export const lerMeta = () => lerJson(META, {tipos:{}, arquivos:{}, pastas:{}});
export const gravarMeta = m => gravarJson(META, m);
export const lerUsuarios = () => lerJson(USUARIOS, []);
export const gravarUsuarios = u => gravarJson(USUARIOS, u);

/* ---------- senhas ---------- */
export function criarHash(senha){
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, sal, 64).toString('hex');
  return {sal, hash};
}
export function conferirSenha(senha, usuario){
  if (!usuario || !usuario.sal || !usuario.hash) return false;
  const h = crypto.scryptSync(senha, usuario.sal, 64);
  const guardado = Buffer.from(usuario.hash, 'hex');
  return guardado.length === h.length && crypto.timingSafeEqual(h, guardado);
}

/* ---------- sessão assinada ---------- */
const segredo = () => process.env.SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN || 'desenvolvimento';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const assinar = d => crypto.createHmac('sha256', segredo()).update(d).digest('base64url');

export function criarToken(dados, duracaoMs){
  const corpo = b64({...dados, exp: Date.now() + duracaoMs});
  return corpo + '.' + assinar(corpo);
}
export function abrirToken(token){
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [corpo, assinatura] = token.split('.');
  const esperada = assinar(corpo);
  if (assinatura.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return null;
  try {
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    return dados.exp > Date.now() ? dados : null;
  } catch(e){ return null; }
}

const DURACAO_SESSAO = 30 * 24 * 60 * 60 * 1000;
export function gravarCookie(res, token){
  const partes = ['sessao=' + token, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + Math.floor(DURACAO_SESSAO/1000)];
  if (process.env.VERCEL) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}
export function limparCookie(res){
  res.setHeader('Set-Cookie', 'sessao=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}
export function criarSessao(res, usuario){
  gravarCookie(res, criarToken({uid:usuario.id}, DURACAO_SESSAO));
}

function cookieDaRequisicao(req, nome){
  const bruto = req.headers.cookie || '';
  for (const parte of bruto.split(';')){
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return null;
}
export async function usuarioAtual(req){
  const dados = abrirToken(cookieDaRequisicao(req, 'sessao'));
  if (!dados || !dados.uid) return null;
  const usuarios = await lerUsuarios();
  return usuarios.find(u => u.id === dados.uid) || null;
}
export async function exigirLogin(req, res){
  const u = await usuarioAtual(req);
  if (!u){ responder(res, 401, {erro:'Faça login para continuar.'}); return null; }
  return u;
}

/* ---------- pareamento do celular (uso único) ---------- */
export async function registrarPareamento(jti){
  const usados = await lerJson(PAREAMENTOS, []);
  if (usados.includes(jti)) return false;
  usados.push(jti);
  await gravarJson(PAREAMENTOS, usados.slice(-50));
  return true;
}

/* ---------- caminhos ---------- */
export const limparNome = n => String(n || '').replace(/[\\/:*?"<>|]/g, '').replace(/\.+$/, '').trim().slice(0, 120);
export const extDe = n => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i).toLowerCase() : ''; };

// O armazenamento só assina caminhos em ASCII, então cada nome vira um segmento
// técnico sem acentos. O nome que a pessoa vê fica guardado no meta.json.
export function segmentoDe(nome){
  const base = String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
    .trim()
    .slice(0, 120);
  return base || 'item';
}

// monta "arquivos/Word/sub/pasta/" a partir da seção e dos segmentos do caminho
export function prefixoDe(secao, partes = []){
  const limpas = (partes || []).map(segmentoDe).filter(Boolean);
  return RAIZ + secao.dir + '/' + (limpas.length ? limpas.join('/') + '/' : '');
}
export function dentroDasSecoes(caminho){
  if (typeof caminho !== 'string' || !caminho.startsWith(RAIZ) || caminho.includes('..')) return false;
  const dir = caminho.slice(RAIZ.length).split('/')[0];
  return SECOES.some(s => s.dir === dir);
}

/* ---------- blobs ---------- */
export async function listarPrefixo(prefixo){
  const itens = [];
  let cursor;
  do {
    const r = await list({prefix: prefixo, cursor, limit: 1000});
    itens.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : null;
  } while (cursor);
  return itens;
}
// sufixo '/' ao procurar nome livre para pasta, já que o marcador termina em barra
export async function nomeLivre(prefixo, nome, sufixo = ''){
  const existentes = new Set((await listarPrefixo(prefixo)).map(b => b.pathname));
  const ocupado = n => existentes.has(prefixo + n + sufixo);
  if (!ocupado(nome)) return nome;
  const i = nome.lastIndexOf('.');
  const base = i > 0 ? nome.slice(0, i) : nome, ext = i > 0 ? nome.slice(i) : '';
  let n = 2;
  while (ocupado(`${base} (${n})${ext}`)) n++;
  return `${base} (${n})${ext}`;
}
export async function urlDeEnvio(caminho, contentType){
  const validUntil = Date.now() + 30 * 60 * 1000;
  const tk = await issueSignedToken({pathname: caminho, operations:['put'], validUntil});
  const {presignedUrl} = await presignUrl(tk, {
    operation:'put', pathname: caminho, access:'private',
    allowOverwrite:true, addRandomSuffix:false, validUntil,
    ...(contentType ? {allowedContentTypes:[contentType]} : {})
  });
  return presignedUrl;
}
export async function urlDeLeitura(caminho){
  const validUntil = Date.now() + 10 * 60 * 1000;
  const tk = await issueSignedToken({pathname: caminho, operations:['get'], validUntil});
  const {presignedUrl} = await presignUrl(tk, {operation:'get', pathname: caminho, access:'private', validUntil});
  return presignedUrl;
}
export const criarPasta = caminho => createFolder(caminho, ACESSO);
export const apagar = urls => del(urls);

/* ---------- resposta ---------- */
export function responder(res, codigo, corpo){
  res.statusCode = codigo;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(corpo));
}
export async function corpoJson(req){
  if (req.body && typeof req.body === 'object') return req.body;
  const partes = [];
  for await (const p of req) partes.push(p);
  if (!partes.length) return {};
  try { return JSON.parse(Buffer.concat(partes).toString()); } catch(e){ return {}; }
}
