// Listagem, envio, download, exclusão, pastas e tipos. Tudo exige sessão.
//
// Nomes: o armazenamento só aceita caminhos em ASCII, então cada item tem um
// "segmento" técnico (sem acentos) e um nome de exibição guardado no meta.json.
import {
  secaoPorId, RAIZ, exigirLogin, lerMeta, gravarMeta, responder, corpoJson,
  listarPrefixo, nomeLivre, urlDeEnvio, urlDeLeitura, criarPasta, apagar,
  limparNome, segmentoDe, extDe, prefixoDe, dentroDasSecoes
} from './_lib.js';

function montarItens(blobs, secao, meta){
  const prefixo = RAIZ + secao.dir + '/';
  const pastas = new Map();
  const arquivos = [];
  const nomeDePasta = caminho => (meta.pastas[prefixo + caminho + '/'] || {}).nome;

  for (const b of blobs){
    const rel = b.pathname.slice(prefixo.length);
    if (!rel) continue;
    if (rel.endsWith('/')){
      const partes = rel.slice(0, -1).split('/');
      const seg = partes[partes.length - 1];
      pastas.set(partes.join('/'), {seg, caminho: partes.slice(0, -1)});
      continue;
    }
    const partes = rel.split('/');
    const seg = partes.pop();
    arquivos.push({
      tipo:'arquivo', seg, caminho: partes, pathname: b.pathname,
      nome: (meta.arquivos[b.pathname] || {}).nome || seg,
      tamanho: b.size, data: new Date(b.uploadedAt).getTime(),
      classe: (meta.arquivos[b.pathname] || {}).tipo || ''
    });
    // pasta sem marcador próprio (arquivo enviado direto para dentro dela)
    for (let i = 1; i <= partes.length; i++){
      const chave = partes.slice(0, i).join('/');
      if (!pastas.has(chave)) pastas.set(chave, {seg: partes[i-1], caminho: partes.slice(0, i-1)});
    }
  }

  const itens = [...pastas.entries()].map(([chave, p]) => ({
    tipo:'pasta', seg:p.seg, caminho:p.caminho, nome: nomeDePasta(chave) || p.seg
  }));
  return itens.concat(arquivos);
}

export default async function handler(req, res){
  const url = new URL(req.url, 'http://x');
  const acao = (req.query && req.query.action) || url.searchParams.get('action');
  const usuario = await exigirLogin(req, res);
  if (!usuario) return;

  try {
    if (acao === 'listar'){
      const secao = secaoPorId(url.searchParams.get('secao'));
      if (!secao) return responder(res, 400, {erro:'Seção inválida.'});
      const meta = await lerMeta();
      const blobs = await listarPrefixo(RAIZ + secao.dir + '/');
      return responder(res, 200, {
        itens: montarItens(blobs, secao, meta),
        tipos: meta.tipos[secao.id] || secao.tipos
      });
    }

    if (acao === 'pasta'){
      const {secao:idSecao, caminho, nome} = await corpoJson(req);
      const secao = secaoPorId(idSecao);
      const exibicao = limparNome(nome);
      if (!secao || !exibicao) return responder(res, 400, {erro:'Informe um nome válido para a pasta.'});
      const pai = prefixoDe(secao, caminho);
      const meta = await lerMeta();
      const jaExiste = Object.entries(meta.pastas).some(([chave, p]) =>
        chave.startsWith(pai) && chave.slice(pai.length).split('/').length === 2 && p.nome === exibicao);
      if (jaExiste) return responder(res, 409, {erro:'Já existe uma pasta com esse nome.'});
      const seg = await nomeLivre(pai, segmentoDe(exibicao), '/');
      const prefixo = pai + seg + '/';
      await criarPasta(prefixo);
      meta.pastas[prefixo] = {nome: exibicao};
      await gravarMeta(meta);
      return responder(res, 200, {ok:true, seg});
    }

    // devolve a URL para o navegador enviar o arquivo direto ao armazenamento
    if (acao === 'enviar'){
      const {secao:idSecao, caminho, nome, contentType} = await corpoJson(req);
      const secao = secaoPorId(idSecao);
      const exibicao = limparNome(nome);
      if (!secao || !exibicao) return responder(res, 400, {erro:'Arquivo sem nome válido.'});
      if (secao.exts && !secao.exts.includes(extDe(exibicao))) return responder(res, 400, {erro:'Este formato não pertence a esta aba.'});
      const pai = prefixoDe(secao, caminho);
      const seg = await nomeLivre(pai, segmentoDe(exibicao));
      return responder(res, 200, {
        url: await urlDeEnvio(pai + seg, contentType),
        nome: exibicao,
        seg,
        pathname: pai + seg
      });
    }

    // grava nome de exibição e tipo depois que o envio terminou
    if (acao === 'confirmar'){
      const {pathname, tipo, nome} = await corpoJson(req);
      if (!dentroDasSecoes(pathname)) return responder(res, 400, {erro:'Caminho inválido.'});
      const meta = await lerMeta();
      meta.arquivos[pathname] = {
        ...(meta.arquivos[pathname] || {}),
        nome: limparNome(nome) || undefined,
        tipo: tipo || undefined
      };
      await gravarMeta(meta);
      return responder(res, 200, {ok:true});
    }

    if (acao === 'tipo'){
      const {pathname, tipo} = await corpoJson(req);
      if (!dentroDasSecoes(pathname)) return responder(res, 400, {erro:'Caminho inválido.'});
      const meta = await lerMeta();
      const atual = meta.arquivos[pathname] || {};
      if (tipo) meta.arquivos[pathname] = {...atual, tipo};
      else if (atual.nome) meta.arquivos[pathname] = {nome: atual.nome};
      else delete meta.arquivos[pathname];
      await gravarMeta(meta);
      return responder(res, 200, {ok:true});
    }

    if (acao === 'tipos'){
      const {secao:idSecao, lista} = await corpoJson(req);
      const secao = secaoPorId(idSecao);
      if (!secao || !Array.isArray(lista)) return responder(res, 400, {erro:'Dados inválidos.'});
      const meta = await lerMeta();
      meta.tipos[secao.id] = lista.map(t => String(t).trim().slice(0, 30)).filter(Boolean).slice(0, 60);
      await gravarMeta(meta);
      return responder(res, 200, {tipos: meta.tipos[secao.id]});
    }

    if (acao === 'excluir'){
      const {pathname, pasta} = await corpoJson(req);
      if (!dentroDasSecoes(pathname)) return responder(res, 400, {erro:'Caminho inválido.'});
      const meta = await lerMeta();
      if (pasta){
        const prefixo = pathname.endsWith('/') ? pathname : pathname + '/';
        const dentro = await listarPrefixo(prefixo);
        if (dentro.length) await apagar(dentro.map(b => b.url));
        for (const chave of Object.keys(meta.arquivos)) if (chave.startsWith(prefixo)) delete meta.arquivos[chave];
        for (const chave of Object.keys(meta.pastas)) if (chave.startsWith(prefixo)) delete meta.pastas[chave];
      } else {
        const alvo = (await listarPrefixo(pathname)).find(b => b.pathname === pathname);
        if (alvo) await apagar(alvo.url);
        delete meta.arquivos[pathname];
      }
      await gravarMeta(meta);
      return responder(res, 200, {ok:true});
    }

    if (acao === 'baixar'){
      const pathname = url.searchParams.get('p');
      if (!dentroDasSecoes(pathname)) return responder(res, 400, {erro:'Caminho inválido.'});
      res.statusCode = 302;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Location', await urlDeLeitura(pathname));
      return res.end();
    }

    return responder(res, 404, {erro:'Ação desconhecida.'});
  } catch(e){
    console.error(e);
    return responder(res, 500, {erro:'Erro no servidor: ' + e.message});
  }
}
