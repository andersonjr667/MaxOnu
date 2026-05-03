require('dotenv').config();

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = process.env.npm_lifecycle_event === 'dev' ? 'development' : 'production';
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const chalk = require('chalk').default;
const figlet = require('figlet');
const User = require('./models/User');
const authRoutes = require('./routes/auth');
const delegationRoutes = require('./routes/delegations');
const postRoutes = require('./routes/posts');
const questionRoutes = require('./routes/questions');
const userRoutes = require('./routes/users');
const exportRoutes = require('./routes/export');
const settingsRoutes = require('./routes/settings');
const dpoRoutes = require('./routes/dpos');
const notificationRoutes = require('./routes/notifications');
const reactionRoutes = require('./routes/reactions');
const { shareMetaMiddleware } = require('./middleware/share-meta');
const cleanUrlsMiddleware = require('./middleware/clean-urls');
const { COMMITTEE_REVEAL_DATE } = require('./utils/event-config');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const publicDir = path.join(__dirname, 'public');
const parsedEnvPort = Number.parseInt(process.env.PORT, 10);
const DEFAULT_PORT = Number.isInteger(parsedEnvPort) ? parsedEnvPort : 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEFAULT_ADMIN = {
  username: 'andersonjr0667',
  fullName: 'Anderson (Admin)',
  password: '152070an',
  email: 'alsj1520@gmail.com',
  role: 'admin',
  classGroup: 'Administracao'
};

const COORDINATORS = [
  {
    username: 'guilherme_loiola',
    fullName: 'Guilherme Loiola',
    password: '12345678',
    email: 'guilherme_loiola@example.com',
    role: 'coordinator',
    classGroup: 'Coordenação'
  },
  {
    username: 'bruno_gusm_o',
    fullName: 'Bruno Gusm O',
    password: '12345678',
    email: 'bruno_gusm_o@example.com',
    role: 'coordinator',
    classGroup: 'Coordenação'
  }
];
let serverInstance;
let PORT = DEFAULT_PORT;
const COMMITTEE_PAGES = new Set([
  '/delegacao-agnu-8-9.html',
  '/delegacao-agnu-em.html',
  '/delegacao-csnu-8-9.html',
  '/delegacao-csnu-em.html',
  '/delegacao-oea-8-9.html',
  '/delegacao-oea-em.html'
]);
const COMMITTEE_DATA = [
  {
    id: 1,
    displayName: 'Conselho de Direitos Humanos (CDH - 2026)',
    shortTitle: '(CDH - 2026)',
    title: 'O Paradoxo da Hiperconectividade: Regulamentação da Vigilância Massiva, Ética da Inteligência Artificial e Proteção da Democracia na Era do Big Data'
  },
  {
    id: 2,
    displayName: 'Assembleia Geral das Nações Unidas (AGNU)',
    shortTitle: '(AGNU)',
    title: 'Guerra, Multipolaridade e Disputas Territoriais: Desafios à Soberania, Segurança Global e Justiça Internacional no Século XXI'
  },
  {
    id: 3,
    displayName: 'Alto Comissariado das Nações Unidas para Refugiados (ACNUR)',
    shortTitle: '(ACNUR - Alto Comissariado das Nações Unidas para Refugiados)',
    title: 'Proteção e garantia de direitos de pessoas em situação de mobilidade humana em contextos de crises humanitárias'
  },
  {
    id: 4,
    displayName: 'Bioética e Genética Humana',
    shortTitle: 'Bioética e Genética Humana',
    title: 'Impactos globais da tecnologia de manipulação e edição genética e seus desafios éticos quanto à dignidade humana e aos direitos das futuras gerações'
  },
  {
    id: 5,
    displayName: 'Nova Ordem Global',
    shortTitle: 'Nova Ordem Global',
    title: 'A Nova Ordem Global em Disputa: Recursos Estratégicos, Poder e os Limites do Capitalismo no Século XXI'
  },
  {
    id: 6,
    displayName: 'Conselho de Direitos Humanos das Nações Unidas (UNHRC)',
    shortTitle: '(UNHRC - Conselho de Direitos Humanos das Nações Unidas)',
    title: 'Identidade, memória e poder: disputas culturais e garantia de direitos em um mundo globalizado'
  },
  {
    id: 7,
    displayName: 'Organização das Nações Unidas para as Mulheres (ONU Mulheres)',
    shortTitle: '(ONU MULHERES)',
    title: ''
  }
];

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

function buildRateLimitMessage(message) {
  return {
    error: message,
    retryAfter: '15 minutes'
  };
}

function createApiLimiter(options) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
    handler: (req, res) => {
      res.status(429).json(buildRateLimitMessage(options.message));
    }
  });
}

function setStaticCacheHeaders(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const longCacheExtensions = new Set(['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.pdf']);

  if (longCacheExtensions.has(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return;
  }

  if (ext === '.html') {
    res.setHeader('Cache-Control', 'public, max-age=300');
  }
}

async function ensureAdminUser() {
  const existingUser = await User.findOne({
    $or: [
      { username: DEFAULT_ADMIN.username },
      { email: DEFAULT_ADMIN.email }
    ]
  });

  if (!existingUser) {
    const adminUser = new User(DEFAULT_ADMIN);
    await adminUser.save();
    log('ok', chalk.green(`Admin ${chalk.bold(DEFAULT_ADMIN.username)} criado.`));
    return;
  }

  let hasChanges = false;

  if (existingUser.username !== DEFAULT_ADMIN.username) {
    existingUser.username = DEFAULT_ADMIN.username;
    hasChanges = true;
  }

  if (existingUser.email !== DEFAULT_ADMIN.email) {
    existingUser.email = DEFAULT_ADMIN.email;
    hasChanges = true;
  }

  if (existingUser.role !== DEFAULT_ADMIN.role) {
    existingUser.role = DEFAULT_ADMIN.role;
    hasChanges = true;
  }

  if (!existingUser.fullName || existingUser.fullName.trim() === '') {
    existingUser.fullName = DEFAULT_ADMIN.fullName;
    hasChanges = true;
  }

  const passwordMatches = await existingUser.comparePassword(DEFAULT_ADMIN.password);
  if (!passwordMatches) {
    existingUser.password = DEFAULT_ADMIN.password;
    hasChanges = true;
  }

  if (hasChanges) {
    await existingUser.save();
    log('ok', chalk.green(`Admin ${chalk.bold(DEFAULT_ADMIN.username)} sincronizado.`));
  } else {
    log('info', chalk.gray(`Admin ${chalk.bold(DEFAULT_ADMIN.username)} já atualizado.`));
  }
}

async function ensureCoordinatorUsers() {
  for (const coord of COORDINATORS) {
    const existingUser = await User.findOne({
      $or: [
        { username: coord.username },
        { email: coord.email }
      ]
    });

    if (!existingUser) {
      const coordinatorUser = new User({
        ...coord,
        gender: 'prefiro-nao-informar',
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        accountStatus: 'active'
      });
      await coordinatorUser.save();
      log('ok', chalk.green(`Coordenador ${chalk.bold(coord.username)} criado.`));
      continue;
    }

    let hasChanges = false;

    if (existingUser.username !== coord.username) {
      existingUser.username = coord.username;
      hasChanges = true;
    }

    if (existingUser.email !== coord.email) {
      existingUser.email = coord.email;
      hasChanges = true;
    }

    if (existingUser.role !== coord.role) {
      existingUser.role = coord.role;
      hasChanges = true;
    }

    if (!existingUser.fullName || existingUser.fullName.trim() === '') {
      existingUser.fullName = coord.fullName;
      hasChanges = true;
    }

    if (existingUser.classGroup !== coord.classGroup) {
      existingUser.classGroup = coord.classGroup;
      hasChanges = true;
    }

    const passwordMatches = await existingUser.comparePassword(coord.password);
    if (!passwordMatches) {
      existingUser.password = coord.password;
      hasChanges = true;
    }

    if (hasChanges) {
      await existingUser.save();
      log('ok', chalk.green(`Coordenador ${chalk.bold(coord.username)} sincronizado.`));
    } else {
      log('info', chalk.gray(`Coordenador ${chalk.bold(coord.username)} já atualizado.`));
    }
  }
}

// ============================================
// TERMINAL OUTPUTS
// ============================================

const W = 62;
const line  = chalk.gray('─'.repeat(W));
const dline = chalk.gray('═'.repeat(W));

function ts() {
  return chalk.gray(new Date().toLocaleTimeString('pt-BR', { hour12: false }));
}

function box(label, color = chalk.cyan) {
  const pad = Math.floor((W - label.length - 2) / 2);
  const left  = '─'.repeat(pad);
  const right = '─'.repeat(W - pad - label.length - 2);
  return chalk.gray(left) + ' ' + color.bold(label) + ' ' + chalk.gray(right);
}

function row(icon, label, value, valueColor = chalk.white) {
  const labelStr = chalk.gray(label.padEnd(18));
  return `  ${icon}  ${labelStr} ${valueColor(value)}`;
}

function log(level, msg) {
  const icons = { info: chalk.blue('◆'), ok: chalk.green('✔'), warn: chalk.yellow('⚠'), err: chalk.red('✖'), db: chalk.magenta('◈') };
  process.stdout.write(`${ts()}  ${icons[level] || icons.info}  ${msg}\n`);
}

function printBanner(port) {
  const banner = figlet.textSync('MaxOnu 2026', { font: 'Standard', horizontalLayout: 'full' });
  const mode = IS_PRODUCTION ? chalk.red.bold('PRODUCTION') : chalk.yellow.bold('DEVELOPMENT');
  const started = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

  console.log('\n' + dline);
  console.log(chalk.cyan.bold(banner));
  console.log(dline);
  console.log(box('INICIALIZANDO SERVIDOR'));
  console.log(line);
  console.log(row('🌐', 'URL local',   `http://localhost:${port}`, chalk.cyan.underline));
  console.log(row('💚', 'Health',      `http://localhost:${port}/health`, chalk.cyan.underline));
  console.log(row('⚙️', 'Modo',        mode));
  console.log(row('🕐', 'Iniciado em', started, chalk.gray));
  console.log(row('🔢', 'Node.js',     process.version, chalk.gray));
  console.log(row('🔑', 'PID',         String(process.pid), chalk.gray));
  console.log(line + '\n');
}

function printServerReady(port) {
  console.log(line);
  console.log(box('  SERVIDOR ONLINE  ', chalk.green));
  console.log(line);
  console.log(`  ${chalk.green('✔')}  ${chalk.white.bold('Pronto em')}  ${chalk.cyan.underline('http://localhost:' + port)}`);
  console.log(chalk.gray(`\n  Pressione ${chalk.white('Ctrl+C')} para encerrar.\n`));
  console.log(line + '\n');
}

function printPortInUse(currentPort, newPort) {
  log('warn', chalk.yellow(`Porta ${chalk.bold(currentPort)} em uso — tentando ${chalk.bold(newPort)}...`));
}

function printServerError(err) {
  console.log('\n' + line);
  console.log(box('  ERRO FATAL  ', chalk.red));
  console.log(line);
  log('err', chalk.red(err.message));
  if (err.code) log('err', chalk.gray('Código: ') + chalk.red(err.code));
  console.log(line + '\n');
}

function printShutdown() {
  console.log('\n' + line);
  log('warn', chalk.yellow('Encerrando servidor...'));
}

function printServerClosed() {
  log('ok', chalk.green('Servidor encerrado.'));
}

function printDbClosed() {
  log('db', chalk.green('Conexão com MongoDB fechada.'));
  console.log(chalk.gray(`\n  Até logo! 👋\n`) + line + '\n');
}

// ============================================
// END TERMINAL OUTPUTS
// ============================================

async function startServer(port) {
  printBanner(port);
  
  serverInstance = app.listen(port, () => {
    printServerReady(port);
  });

  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      printPortInUse(port, port + 1);
      PORT = port + 1;
      startServer(PORT);
    } else {
      printServerError(err);
      process.exit(1);
    }
});
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const gracefulShutdown = () => {
  printShutdown();
  serverInstance.close(() => {
    printServerClosed();
    mongoose.connection.close(() => {
      printDbClosed();
      process.exit(0);
    });
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ============================================
// ENV VALIDATION
// ============================================

const envSchema = Joi.object({
  JWT_SECRET: Joi.string().required(),
  MONGODB_URI: Joi.string().uri().required()
}).unknown();
const { error } = envSchema.validate(process.env);
if (error) {
  console.error(chalk.red('Env error:'), error.details[0].message);
  process.exit(1);
}

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "img-src": ["'self'", "data:", "blob:", "https://res.cloudinary.com"]
    }
  }
}));
if (!IS_PRODUCTION) {
  app.use(morgan('dev'));
}
app.use(compression({
  level: 6,
  threshold: 1024
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const publicApiLimiter = createApiLimiter({
  max: 1000,
  message: 'Muitas requisicoes em pouco tempo. Tente novamente em alguns minutos.',
  skip: (req) => req.path === '/health' || req.method !== 'GET'
});

const writeApiLimiter = createApiLimiter({
  max: 120,
  message: 'Muitas acoes enviadas em pouco tempo. Aguarde um pouco antes de tentar novamente.',
  skip: (req) => req.method === 'GET'
});

const authApiLimiter = createApiLimiter({
  max: 20,
  message: 'Muitas tentativas de autenticacao. Aguarde alguns minutos antes de tentar novamente.'
});

app.use('/api', publicApiLimiter);
app.use('/api', writeApiLimiter);
app.use(
  ['/api/login', '/api/register', '/api/check-admin', '/api/forgot-password', '/api/verify-reset-code', '/api/reset-password', '/api/verify-2fa-login'],
  authApiLimiter
);


// Favicon - serve from images folder to avoid 404 (using logo-maxonu.png since favicon.ico is empty)
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(publicDir, 'images', 'logo-maxonu.png'));
});

// Health
app.get('/health', (req, res) => res.json({
  status: 'OK',
  db: isDbReady(),
  uptime: process.uptime()
}));

app.get('/api/reveal-status', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({
    revealed: Date.now() >= COMMITTEE_REVEAL_DATE.getTime(),
    revealDate: COMMITTEE_REVEAL_DATE.toISOString()
  });
});

app.get('/api/committees', (req, res) => {
  const revealed = Date.now() >= COMMITTEE_REVEAL_DATE.getTime();
  res.setHeader('Cache-Control', revealed ? 'public, max-age=3600' : 'public, max-age=300');
  if (!revealed) {
    return res.status(403).json({ message: 'Sigilo' });
  }
  res.json({ revealed, committees: COMMITTEE_DATA });
});

app.use('/api', authRoutes);
app.use('/api/delegation', delegationRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dpos', dpoRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reactions', reactionRoutes);

// Share meta tags middleware para melhorar compartilhamento em redes sociais
app.use(shareMetaMiddleware(publicDir));

// Clean URLs middleware - remove extensão .html e oferece rotas amigáveis
app.use(cleanUrlsMiddleware(publicDir));

app.use((req, res, next) => {
  if (COMMITTEE_PAGES.has(req.path)) return res.redirect('/delegacoes');
  next();
});

// Static
app.use(express.static(publicDir, {
  etag: true,
  maxAge: '7d',
  setHeaders: setStaticCacheHeaders
}));

app.get('/header', (req, res) => res.sendFile(path.join(publicDir, 'header.html')));
app.get('/footer', (req, res) => res.sendFile(path.join(publicDir, 'footer.html')));

// MongoDB
const connectDB = async () => {
  try {
    log('db', chalk.gray('Conectando ao MongoDB...'));
    await mongoose.connect(process.env.MONGODB_URI);
    log('db', chalk.green('MongoDB conectado com sucesso.'));
    await ensureAdminUser();
    await ensureCoordinatorUsers();
  } catch (err) {
    log('err', chalk.red('Falha ao conectar ao MongoDB: ') + chalk.gray(err.message));
    log('warn', chalk.yellow(`Tentando reconectar em 5s...`));
    setTimeout(connectDB, 5000);
  }
};

mongoose.connection.on('disconnected', () => {
  log('warn', chalk.yellow('MongoDB desconectado. Reconectando...'));
  connectDB();
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Server error' });
  }
  next(err);
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// 404
app.use((req, res) => res.status(404).sendFile(path.join(publicDir, '404.html')));

// Init
connectDB();
startServer(PORT);
 
