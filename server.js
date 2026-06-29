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
const fs = require('fs');
const os = require('os');
const nodemailer = require('nodemailer');
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
const newsletterRoutes = require('./routes/newsletter');
const commentRoutes = require('./routes/comments');
const analyticsRoutes = require('./routes/analytics');
const maintenanceRoutes = require('./routes/maintenance');
const { shareMetaMiddleware } = require('./middleware/share-meta');
const cleanUrlsMiddleware = require('./middleware/clean-urls');
const { injectVersionMiddleware } = require('./middleware/version-inject');
const jwt = require('jsonwebtoken');
const { maintenanceMiddleware } = require('./middleware/maintenance');
const { COMMITTEE_REVEAL_DATE } = require('./utils/event-config');

// Load version for cache busting
let APP_VERSION = Date.now().toString();
try {
  const versionData = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8'));
  APP_VERSION = versionData.version || APP_VERSION;
} catch (error) {
  console.warn('Could not load version.json, using timestamp as version');
}

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
    shortTitle: '(ACNUR)',
    title: 'Proteção e garantia de direitos de pessoas em situação de mobilidade humana em contextos de crises humanitárias'
  },
  {
    id: 4,
    displayName: 'Bioética e Genética Humana',
    shortTitle: 'Bioética e Genética Humana',
    title: 'Impactos globais da tecnologia de manipulação e edição genética e seus desafios éticos quanto à dignidade humana e os direitos das futuras gerações'
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
    shortTitle: '(UNHRC)',
    title: 'Identidade, memória e poder: disputas culturais e garantia de direitos em um mundo globalizado'
  },
  {
    id: 7,
    displayName: 'Organização das Nações Unidas para as Mulheres (ONU Mulheres)',
    shortTitle: '(ONU Mulheres - CSW/2026)',
    title: 'Vozes, Leis e Limites: O Desafio de Enfrentar a Violência contra Mulheres'
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
// EMAIL TEST FUNCTION
// ============================================

function hasEmailTransportConfig() {
  const hasUser = Boolean(process.env.EMAIL_USER);
  const hasPass = Boolean(process.env.EMAIL_PASSWORD);
  const isValidUser = hasUser && !String(process.env.EMAIL_USER).includes('seu-email');
  const isValidPass = hasPass && !String(process.env.EMAIL_PASSWORD).includes('sua-senha');
  
  log('info', chalk.blue(`Email config check: USER=${hasUser}, PASS=${hasPass}, VALID_USER=${isValidUser}, VALID_PASS=${isValidPass}`));
  
  return Boolean(hasUser && hasPass && isValidUser && isValidPass);
}

async function sendTestEmail() {
  // Verificar se tem configuração de email (Resend ou SMTP)
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasSmtp = hasEmailTransportConfig();
  
  if (!hasResend && !hasSmtp) {
    log('warn', chalk.yellow('Email não configurado (nem Resend nem SMTP). Pulando teste de email.'));
    return;
  }

  // Enviar email em background sem bloquear o startup
  setImmediate(async () => {
    try {
      log('info', chalk.blue('Enviando email de teste em background...'));

      const testTime = new Date().toLocaleString('pt-BR', { 
        dateStyle: 'short', 
        timeStyle: 'medium' 
      });

      // Resend free tier: apenas envia para o email da conta (maxonu2023@gmail.com)
      // Com domínio verificado: pode enviar para qualquer email
      const recipients = process.env.RESEND_VERIFIED_DOMAIN 
        ? ['alsj1520@gmail.com', 'maxonu2023@gmail.com']
        : ['maxonu2023@gmail.com'];
      
      const emailContent = {
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: recipients,
        subject: `✅ Servidor MaxOnu 2026 Iniciado - ${testTime}`,
        html: `
        <div style="margin:0;padding:24px;background:#f2f7fc;font-family:Arial,Helvetica,sans-serif;color:#16324a;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d7e6f4;">
            <tr>
              <td style="background:linear-gradient(135deg,#0a5ea3,#1b7ac9);text-align:center;padding:30px;">
                <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;">🚀 MaxOnu 2026</h1>
                <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Sistema de Gerenciamento</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 24px;">
                <h2 style="margin:0 0 16px 0;font-size:22px;color:#0b3252;">✅ Servidor Iniciado com Sucesso</h2>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#3a5975;">
                  O servidor <strong>MaxOnu 2026</strong> foi iniciado com sucesso e está pronto para receber requisições.
                </p>
                
                <div style="margin:20px 0;padding:16px;border-radius:12px;background:#f1f8ff;border:1px solid #bcd9f3;">
                  <p style="margin:0 0 8px 0;font-size:14px;color:#0b4f86;"><strong>📅 Data/Hora:</strong></p>
                  <p style="margin:0;font-size:16px;font-weight:700;color:#0b4f86;">${testTime}</p>
                </div>

                <div style="margin:20px 0;padding:16px;border-radius:12px;background:#f0fdf4;border:1px solid #bbf7d0;">
                  <p style="margin:0 0 8px 0;font-size:14px;color:#166534;"><strong>🌐 Ambiente:</strong></p>
                  <p style="margin:0;font-size:16px;font-weight:700;color:#166534;">${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}</p>
                </div>

                <div style="margin:20px 0;padding:16px;border-radius:12px;background:#fef3c7;border:1px solid #fde68a;">
                  <p style="margin:0 0 8px 0;font-size:14px;color:#92400e;"><strong>📧 Método de Envio:</strong></p>
                  <p style="margin:0;font-size:14px;color:#92400e;">✅ ${hasResend ? 'Resend API' : 'SMTP'}</p>
                </div>

                <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#3a5975;">
                  Este é um email automático de teste enviado ao iniciar o servidor. Se você recebeu esta mensagem, significa que o sistema de envio de emails está funcionando perfeitamente.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#6d8398;border-top:1px solid #e1edf8;padding-top:14px;">
                  Mensagem automática da plataforma MaxOnu 2026 • Não responda este email
                </p>
              </td>
            </tr>
          </table>
        </div>
      `
      };

      let info;
      
      if (hasResend) {
        // Usar Resend API (mais confiável)
        log('info', chalk.blue('Usando Resend API...'));
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(emailContent)
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(`Resend API error: ${JSON.stringify(data)}`);
        }
        
        info = { messageId: data.id };
        log('ok', chalk.green('✉️  Email de teste enviado com sucesso via Resend!'));
      } else {
        // Fallback para SMTP
        log('info', chalk.blue('Usando SMTP...'));
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
          },
          tls: {
            rejectUnauthorized: false
          },
          connectionTimeout: 30000,
          greetingTimeout: 30000,
          socketTimeout: 30000
        });

        info = await transporter.sendMail({
          ...emailContent,
          to: emailContent.to.join(', ')
        });
        log('ok', chalk.green('✉️  Email de teste enviado com sucesso via SMTP!'));
      }

      log('info', chalk.gray(`Message ID: ${info.messageId}`));
    } catch (error) {
      log('warn', chalk.yellow('Email de teste falhou (não crítico): ') + chalk.gray(error.message));
      if (error.code) {
        log('info', chalk.gray(`Código: ${error.code}`));
      }
      log('info', chalk.gray('O servidor continuará funcionando normalmente.'));
    }
  });

  // Retorna imediatamente sem esperar o email
  log('info', chalk.gray('Email de teste agendado para envio em background.'));
}

// ============================================
// END EMAIL TEST FUNCTION
// ============================================

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

function getNetworkUrls(port) {
  const urls = [];
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.family !== 'IPv4' || entry.internal) continue;
      urls.push(`http://${entry.address}:${port}`);
    }
  }

  return [...new Set(urls)];
}

function log(level, msg) {
  const icons = { info: chalk.blue('◆'), ok: chalk.green('✔'), warn: chalk.yellow('⚠'), err: chalk.red('✖'), db: chalk.magenta('◈') };
  process.stdout.write(`${ts()}  ${icons[level] || icons.info}  ${msg}\n`);
}

function printBanner(port, urls = []) {
  const banner = figlet.textSync('MaxOnu 2026', { font: 'Standard', horizontalLayout: 'full' });
  const mode = IS_PRODUCTION ? chalk.red.bold('PRODUCTION') : chalk.yellow.bold('DEVELOPMENT');
  const started = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  const localUrl = `http://localhost:${port}`;

  console.log('\n' + dline);
  console.log(chalk.cyan.bold(banner));
  console.log(dline);
  console.log(box('INICIALIZANDO SERVIDOR'));
  console.log(line);
  console.log(row('🌐', 'URL local',   localUrl, chalk.cyan.underline));
  if (urls.length) {
    console.log(row('📱', 'URL na rede', urls.join(chalk.gray(' | ')), chalk.cyan.underline));
  }
  console.log(row('💚', 'Health',      `${localUrl}/health`, chalk.cyan.underline));
  console.log(row('⚙️', 'Modo',        mode));
  console.log(row('🕐', 'Iniciado em', started, chalk.gray));
  console.log(row('🔢', 'Node.js',     process.version, chalk.gray));
  console.log(row('🔑', 'PID',         String(process.pid), chalk.gray));
  console.log(line + '\n');
}

function printServerReady(port, urls = []) {
  const localUrl = `http://localhost:${port}`;
  console.log(line);
  console.log(box('  SERVIDOR ONLINE  ', chalk.green));
  console.log(line);
  console.log(`  ${chalk.green('✔')}  ${chalk.white.bold('Pronto em')}  ${chalk.cyan.underline(localUrl)}`);
  if (urls.length) {
    console.log(`  ${chalk.green('✔')}  ${chalk.white.bold('Na rede')}    ${chalk.cyan.underline(urls[0])}`);
  }
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
  const networkUrls = getNetworkUrls(port);
  printBanner(port, networkUrls);
  
  serverInstance = app.listen(port, '0.0.0.0', () => {
    printServerReady(port, networkUrls);
    
    // Enviar email de teste em background (não bloqueia o startup)
    sendTestEmail();
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

const gracefulShutdown = async () => {
  printShutdown();
  serverInstance.close(() => {
    printServerClosed();
    mongoose.connection.close().then(() => {
      printDbClosed();
      process.exit(0);
    }).catch((err) => {
      console.error('Erro ao fechar MongoDB:', err);
      process.exit(1);
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
      "upgrade-insecure-requests": null,
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

app.get('/api/features', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    newsletter: process.env.NEWSLETTER_ENABLED === 'true',
    version: APP_VERSION
  });
});

app.get('/api/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    version: APP_VERSION,
    timestamp: Date.now()
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
app.use('/api/newsletter', newsletterRoutes);

// Middleware to block newsletter page if disabled
app.use('/newsletter', (req, res, next) => {
    if (process.env.NEWSLETTER_ENABLED !== 'true') {
        return res.redirect('/');
    }
    next();
});

app.use('/api/comments', commentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin/maintenance', maintenanceRoutes);

// Share meta tags middleware para melhorar compartilhamento em redes sociais
app.use(shareMetaMiddleware(publicDir));

// Version injection middleware - inject version in HTML files
app.use(injectVersionMiddleware(publicDir));

// Expose version globally in client-side code (helps dynamic loaders like ensureCss)
app.use((req, res, next) => {
  // used by middleware/version-inject (already injects ?v=APP_VERSION on HTML)
  // but also exposed as a global for scripts that dynamically load CSS/JS
  res.locals.APP_VERSION = APP_VERSION;
  res.setHeader('X-App-Version', APP_VERSION);
  next();
});

// Expose as a global variable on HTML pages (best-effort)
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (data) {
    if (typeof data === 'string' && data.includes('</head>')) {
      const injected = data.replace(
        '</head>',
        `<script>window.__APP_VERSION=${JSON.stringify(APP_VERSION)};</script></head>`
      );
      return originalSend.call(this, injected);
    }
    return originalSend.call(this, data);
  };
  next();
});

// Expose flag assets stored outside /public
app.use('/paises', express.static(path.join(__dirname, 'paises'), {
  etag: true,
  maxAge: '7d',
  setHeaders: setStaticCacheHeaders
}));

app.get('/api/flags-catalog', (req, res) => {
  try {
    const flagsDir = path.join(__dirname, 'paises', 'flags');
    const files = fs.readdirSync(flagsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /\.(png|jpe?g|webp|gif|svg)$/i.test(name))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const flags = files.map((fileName) => {
      const stem = fileName.replace(/\.[^.]+$/, '');
      const label = stem
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .split(' ')
        .map((word) => word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word)
        .join(' ');

      return {
        fileName,
        label,
        url: `/paises/flags/${encodeURIComponent(fileName)}`
      };
    });

    res.json({ total: flags.length, flags });
  } catch (error) {
    res.status(500).json({ error: 'Nao foi possivel carregar o catalogo de bandeiras.' });
  }
});

// Clean URLs middleware - remove extensão .html e oferece rotas amigáveis
app.use(maintenanceMiddleware);
app.use(cleanUrlsMiddleware(publicDir));

// ============================================
// PAGE AUTH (ROBUSTO)
// ============================================
// Garante que HTML estático respeite as regras por role.
// A regra usa data-portal-role no <body> quando existir.
const pageRoleGuard = (req, res, next) => {
  try {
    // Não proteger assets e rotas que já são /api
    if (!req.path || req.path.startsWith('/api')) return next();
    if (req.path.startsWith('/css') || req.path.startsWith('/js') || req.path.startsWith('/images')) return next();

    // Somente páginas HTML (no projeto elas são servidas sem extensão via cleanUrls)
    const isCandidatePage = !req.path.includes('.') && req.path !== '/' && req.path !== '/login' && req.path !== '/verify-2fa-login';
    if (!isCandidatePage) return next();

    // Mapeia path -> file/portal role
    const htmlPath = path.join(publicDir, `${req.path}.html`);

    // Se arquivo não existir, deixa passar (ex: páginas que não são HTML)
    if (!fs.existsSync(htmlPath)) return next();

    const file = fs.readFileSync(htmlPath, 'utf8');
    const match = file.match(/<body[^>]*data-portal-role=["']([^"']+)["']/i);
    if (!match) return next();

    const requiredRole = match[1] || (req.path === '/admin' ? 'admin' : null);
    if (!requiredRole) return next();

    // Login é via token no header Authorization
    const authHeader = req.headers.authorization;
    const tokenMatch = authHeader && typeof authHeader === 'string' ? authHeader.match(/^\s*Bearer\s+(.+?)\s*$/i) : null;
    const token = tokenMatch?.[1];

    if (!token) return res.redirect('/login');

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (e) {
      return res.redirect('/login');
    }

    const userId = decoded?.id;
    if (!userId) return res.redirect('/login');

    // Busca role atual no banco para evitar token antigo
    User.findById(userId).select('role username fullName accountStatus')
      .then((user) => {
        if (!user) return res.redirect('/login');
        if (String(user.role) !== String(requiredRole) && String(requiredRole) !== 'candidate') {
          // candidate é “fallback” no front, aqui exigimos role exata.
          return res.redirect('/');
        }
        return next();
      })
      .catch(() => res.redirect('/login'));
  } catch {
    return next();
  }
};

app.use(pageRoleGuard);

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
app.get('/gerenciar-paises', (req, res) => res.sendFile(path.join(publicDir, 'gerenciar-paises.html')));

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
 
