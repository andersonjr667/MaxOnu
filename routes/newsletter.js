const express = require('express');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const authMiddleware = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');
const Newsletter = require('../models/Newsletter');

const router = express.Router();

// Middleware to check if newsletter is enabled
const checkNewsletterEnabled = (req, res, next) => {
    const isEnabled = process.env.NEWSLETTER_ENABLED === 'true';
    if (!isEnabled) {
        return res.status(503).json({ error: 'Newsletter feature is currently disabled.' });
    }
    next();
};

function getTransporter() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('SMTP not configured. Email sending disabled.');
        return null;
    }
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}

function buildEmailTemplate({ title, preheader, body: bodyHtml, unsubscribeUrl }) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#eef4f8;font-family:'Segoe UI',Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef4f8;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(8,31,56,0.12);">
      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#0d3b66 0%,#1f6fa8 60%,#ff8c42 100%);padding:32px 40px;text-align:center;">
          <p style="margin:0 0 8px;color:rgba(255,209,102,0.9);font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;">MaxOnu 2026</p>
          <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:900;letter-spacing:-0.02em;">${title}</h1>
        </td>
      </tr>
      <!-- Body -->
      <tr>
        <td style="padding:36px 40px;color:#17324d;font-size:15px;line-height:1.7;">
          ${bodyHtml}
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td style="background:#f4f8fc;padding:20px 40px;text-align:center;border-top:1px solid rgba(13,59,102,0.08);">
          <p style="margin:0 0 8px;color:#5f748c;font-size:12px;">Você está recebendo este email porque se inscreveu na newsletter da MaxOnu 2026.</p>
          ${unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:#1f6fa8;font-size:12px;text-decoration:underline;">Cancelar inscrição</a>` : ''}
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// GET /api/newsletter/status - Check if newsletter is enabled
router.get('/status', (req, res) => {
    res.json({ enabled: process.env.NEWSLETTER_ENABLED === 'true' });
});

// POST /api/newsletter/subscribe
router.post('/subscribe', checkNewsletterEnabled, [
    body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
    body('name').optional().trim().isLength({ max: 80 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email, name = '' } = req.body;

    try {
        const existing = await Newsletter.findOne({ email });

        if (existing) {
            if (existing.active) {
                return res.status(409).json({ error: 'Este email já está inscrito.' });
            }
            // Reactivate subscription
            existing.active = true;
            existing.unsubscribedAt = null;
            existing.confirmedAt = new Date();
            if (name) existing.name = name;
            await existing.save();
            return res.json({ message: 'Inscrição reativada com sucesso!' });
        }

        // Create new subscription
        await Newsletter.create({ email, name, confirmedAt: new Date() });

        // Send welcome email
        const transporter = getTransporter();
        if (transporter) {
            const appUrl = process.env.APP_URL || 'https://maxonu2026.onrender.com';
            const html = buildEmailTemplate({
                title: 'Bem-vindo à Newsletter!',
                preheader: 'Sua inscrição na MaxOnu 2026 foi confirmada.',
                body: `<p>Olá${name ? ` <strong>${name}</strong>` : ''}!</p>
                       <p>Sua inscrição na newsletter da <strong>MaxOnu 2026</strong> foi confirmada. Você receberá atualizações sobre o evento, novidades e avisos importantes.</p>
                       <p style="margin-top:24px;"><a href="${appUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#ff8c42,#ffd166);color:#081f38;font-weight:800;border-radius:999px;text-decoration:none;">Acessar o site</a></p>`,
                unsubscribeUrl: `${appUrl}/newsletter?action=unsubscribe&email=${encodeURIComponent(email)}`
            });
            await transporter.sendMail({
                from: `"MaxOnu 2026" <${process.env.SMTP_USER}>`,
                to: email,
                subject: '✅ Inscrição confirmada — MaxOnu 2026',
                html
            }).catch(err => console.error('Welcome email error:', err));
        }

        res.status(201).json({ message: 'Inscrição realizada com sucesso!' });
    } catch (err) {
        console.error('Subscribe error:', err);
        res.status(500).json({ error: 'Erro ao processar inscrição.' });
    }
});

// DELETE /api/newsletter/unsubscribe
router.delete('/unsubscribe', checkNewsletterEnabled, [
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Email inválido.' });
    }

    const { email } = req.body;

    try {
        const sub = await Newsletter.findOne({ email });
        if (!sub || !sub.active) {
            return res.status(404).json({ error: 'Email não encontrado na lista.' });
        }
        sub.active = false;
        sub.unsubscribedAt = new Date();
        await sub.save();
        res.json({ message: 'Inscrição cancelada com sucesso.' });
    } catch (err) {
        console.error('Unsubscribe error:', err);
        res.status(500).json({ error: 'Erro ao cancelar inscrição.' });
    }
});

// GET /api/newsletter/subscribers — admin only
router.get('/subscribers', checkNewsletterEnabled, authMiddleware, roleAuth(['admin', 'coordinator']), async (req, res) => {
    try {
        const { active } = req.query;
        const filter = {};
        if (active !== undefined) filter.active = active === 'true';
        const subscribers = await Newsletter.find(filter).sort({ createdAt: -1 }).select('-__v');
        res.json({ total: subscribers.length, subscribers });
    } catch (err) {
        console.error('Get subscribers error:', err);
        res.status(500).json({ error: 'Erro ao buscar inscritos.' });
    }
});

// POST /api/newsletter/send — admin only
router.post('/send', checkNewsletterEnabled, authMiddleware, roleAuth(['admin']), [
    body('subject').trim().notEmpty().withMessage('Assunto obrigatório'),
    body('title').trim().notEmpty().withMessage('Título obrigatório'),
    body('content').trim().notEmpty().withMessage('Conteúdo obrigatório')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }

    const transporter = getTransporter();
    if (!transporter) {
        return res.status(503).json({ error: 'Serviço de email não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS.' });
    }

    const { subject, title, content } = req.body;

    try {
        const subscribers = await Newsletter.find({ active: true }).select('email name');
        if (!subscribers.length) {
            return res.json({ message: 'Nenhum inscrito ativo.', sent: 0 });
        }

        let sent = 0;
        let failed = 0;
        const appUrl = process.env.APP_URL || 'https://maxonu2026.onrender.com';

        for (const sub of subscribers) {
            const html = buildEmailTemplate({
                title,
                preheader: subject,
                body: `<p>${content.replace(/\n/g, '<br>')}</p>`,
                unsubscribeUrl: `${appUrl}/newsletter?action=unsubscribe&email=${encodeURIComponent(sub.email)}`
            });
            try {
                await transporter.sendMail({
                    from: `"MaxOnu 2026" <${process.env.SMTP_USER}>`,
                    to: sub.email,
                    subject,
                    html
                });
                sent++;
            } catch (err) {
                console.error(`Failed to send to ${sub.email}:`, err.message);
                failed++;
            }
        }

        res.json({ 
            message: `Email enviado para ${sent} de ${subscribers.length} inscritos.${failed > 0 ? ` ${failed} falharam.` : ''}`, 
            sent, 
            failed,
            total: subscribers.length 
        });
    } catch (err) {
        console.error('Send newsletter error:', err);
        res.status(500).json({ error: 'Erro ao enviar emails.' });
    }
});

module.exports = router;
