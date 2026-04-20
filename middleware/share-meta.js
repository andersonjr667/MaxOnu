const path = require('path');
const fs = require('fs');

// Configurações de meta tags para cada página
const META_TAGS_CONFIG = {
  '/': {
    title: 'MaxOnu 2026 - Simulação de Debates da ONU',
    description: 'Conheça a MaxOnu 2026, uma simulação realista de debates da ONU organizada pelo Colégio Maximus. Um espaço onde estudantes exercitam diplomacia, oratória e pensamento estratégico em 7 comitês diferenciados, negociando e representando países em temas globais de importância.',
    image: '/images/logo-maxonu.png',
    url: 'https://maxonu.coleiomaximus.com.br',
    type: 'website'
  },
  '/index.html': {
    title: 'MaxOnu 2026 - Simulação de Debates da ONU',
    description: 'Conheça a MaxOnu 2026, uma simulação realista de debates da ONU organizada pelo Colégio Maximus. Um espaço onde estudantes exercitam diplomacia, oratória e pensamento estratégico em 7 comitês diferenciados, negociando e representando países em temas globais de importância.',
    image: '/images/logo-maxonu.png',
    url: 'https://maxonu.coleiomaximus.com.br',
    type: 'website'
  },
  '/blog': {
    title: 'Blog - MaxOnu 2026',
    description: 'Comunicados, orientações e atualizações da MaxOnu 2026. Acompanhe as últimas notícias sobre a simulação de debates da ONU.',
    image: '/images/logo-maxonu.png',
    url: 'https://maxonu.coleiomaximus.com.br/blog',
    type: 'website'
  },
  '/blog.html': {
    title: 'Blog - MaxOnu 2026',
    description: 'Comunicados, orientações e atualizações da MaxOnu 2026. Acompanhe as últimas notícias sobre a simulação de debates da ONU.',
    image: '/images/logo-maxonu.png',
    url: 'https://maxonu.coleiomaximus.com.br/blog',
    type: 'website'
  },
  '/guias': {
    title: 'Guias - MaxOnu 2026',
    description: 'Guias completos para delegados, professores orientadores e coordenadores. Aprenda sobre os comitês, regras e procedimentos da MaxOnu 2026.',
    image: '/images/logo-maxonu.png',
    url: 'https://maxonu.coleiomaximus.com.br/guias',
    type: 'website'
  },
  '/guias.html': {
    title: 'Guias - MaxOnu 2026',
    description: 'Guias completos para delegados, professores orientadores e coordenadores. Aprenda sobre os comitês, regras e procedimentos da MaxOnu 2026.',
    image: '/images/logo-maxonu.png',
    url: 'https://maxonu.coleiomaximus.com.br/guias',
    type: 'website'
  },
  '/inscricao': {
    title: 'Inscrição - MaxOnu 2026',
    description: 'Inscreva-se na MaxOnu 2026 e junte-se a uma simulação única de debates da ONU. Conheça a MaxOnu, represente seu país e participe de negociações diplomáticas em temas globais relevantes ao mundo atual.',
    image: '/images/logo-maxonu.png',
    url: 'https://maxonu.coleiomaximus.com.br/inscricao',
    type: 'website'
  },
  '/inscricao.html': {
    title: 'Inscrição - MaxOnu 2026',
    description: 'Inscreva-se na MaxOnu 2026 e junte-se a uma simulação única de debates da ONU. Conheça a MaxOnu, represente seu país e participe de negociações diplomáticas em temas globais relevantes ao mundo atual.',
    image: '/images/logo-maxonu.png',
    url: 'https://maxonu.coleiomaximus.com.br/inscricao',
    type: 'website'
  },
  '/delegacoes': {
    title: 'Delegações - MaxOnu 2026',
    description: 'Conheça as delegações e comitês da MaxOnu 2026. Explore as diferentes áreas de negociação e especialização do evento.',
    image: '/images/logo-maxonu.png',
    url: 'https://maxonu.coleiomaximus.com.br/delegacoes',
    type: 'website'
  },
  '/delegacoes.html': {
    title: 'Delegações - MaxOnu 2026',
    description: 'Conheça as delegações e comitês da MaxOnu 2026. Explore as diferentes áreas de negociação e especialização do evento.',
    image: '/images/logo-maxonu.png',
    url: 'https://maxonu.coleiomaximus.com.br/delegacoes',
    type: 'website'
  },
  '/faq': {
    title: 'Perguntas Comuns - MaxOnu 2026',
    description: 'Tire suas dúvidas sobre a MaxOnu 2026. Encontre respostas para as perguntas mais frequentes sobre inscrição, funcionamento e participação no evento.',
    image: '/images/logo-maxonu.png',
    url: 'https://maxonu.coleiomaximus.com.br/faq',
    type: 'website'
  },
  '/perguntas-comuns.html': {
    title: 'Perguntas Comuns - MaxOnu 2026',
    description: 'Tire suas dúvidas sobre a MaxOnu 2026. Encontre respostas para as perguntas mais frequentes sobre inscrição, funcionamento e participação no evento.',
    image: '/images/logo-maxonu.png',
    url: 'https://maxonu.coleiomaximus.com.br/faq',
    type: 'website'
  }
};

/**
 * Gera meta tags Open Graph e Twitter Card para compartilhamento social
 * @param {Object} config - Configuração com title, description, image, url, type
 * @returns {string} String com as meta tags HTML
 */
function generateShareMetaTags(config) {
  const baseUrl = 'https://maxonu.coleiomaximus.com.br';
  const imageUrl = config.image.startsWith('http') ? config.image : `${baseUrl}${config.image}`;
  const fullUrl = config.url.startsWith('http') ? config.url : `${baseUrl}${config.url}`;

  return `    <!-- Open Graph Meta Tags (Facebook, LinkedIn, WhatsApp) -->
    <meta property="og:type" content="${config.type}">
    <meta property="og:title" content="${config.title}">
    <meta property="og:description" content="${config.description}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:url" content="${fullUrl}">
    <meta property="og:site_name" content="MaxOnu 2026">
    <meta property="og:locale" content="pt_BR">
    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${config.title}">
    <meta name="twitter:description" content="${config.description}">
    <meta name="twitter:image" content="${imageUrl}">
    <!-- SEO Meta Tags -->
    <meta name="description" content="${config.description}">
    <meta name="keywords" content="MaxOnu, ONU, Simulação, Debate, Colégio Maximus, 2026">
    <meta name="author" content="Colégio Maximus">`;
}

/**
 * Middleware que injeta meta tags de compartilhamento nos arquivos HTML
 */
function shareMetaMiddleware(publicDir) {
  return (req, res, next) => {
    // Apenas processa requisições GET para arquivos HTML
    if (req.method !== 'GET') {
      return next();
    }

    const filePath = path.join(publicDir, req.path);
    const ext = path.extname(filePath).toLowerCase();

    // Verifica se é uma requisição por arquivo HTML
    if (ext !== '.html' && req.path !== '/' && req.path !== '') {
      return next();
    }

    // Determina o caminho da página para a configuração
    let pagePath = req.path;
    if (pagePath === '/' || pagePath === '') {
      pagePath = '/index.html';
    }
    if (!pagePath.endsWith('.html') && pagePath !== '/') {
      pagePath += '.html';
    }

    // Determina o arquivo a ser lido
    let fileToRead = filePath;
    if (req.path === '/' || req.path === '') {
      fileToRead = path.join(publicDir, 'index.html');
    }

    // Lê o arquivo HTML
    fs.readFile(fileToRead, 'utf8', (err, data) => {
      if (err) {
        // Se não conseguir ler o arquivo, passa para o próximo middleware
        return next();
      }

      // Obtém a configuração de meta tags para esta página
      const config = META_TAGS_CONFIG[pagePath] || META_TAGS_CONFIG['/'];
      const shareMetaTags = generateShareMetaTags(config);

      // Substitui o marcador ou insere antes de </head>
      let modifiedData = data;
      if (data.includes('<!-- SHARE_META_TAGS -->')) {
        modifiedData = data.replace('<!-- SHARE_META_TAGS -->', shareMetaTags);
      } else {
        modifiedData = data.replace('</head>', `${shareMetaTags}\n</head>`);
      }

      // Configura headers de cache para HTML
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');

      // Envia o arquivo modificado
      res.send(modifiedData);
    });
  };
}

module.exports = {
  shareMetaMiddleware,
  generateShareMetaTags,
  META_TAGS_CONFIG
};

