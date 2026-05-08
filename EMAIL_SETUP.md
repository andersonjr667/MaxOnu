# Configuração de Email - MaxOnu 2026

## Status Atual
✅ Resend configurado e funcionando
✅ Emails enviados para: maxonu2023@gmail.com

## Para enviar emails para múltiplos destinatários

### Opção 1: Verificar Domínio no Resend (Recomendado)

#### Passo 1: Adicionar domínio
1. Acesse: https://resend.com/domains
2. Clique em "Add Domain"
3. Digite seu domínio (ex: maxonu.com.br)

#### Passo 2: Configurar DNS
Adicione os seguintes registros DNS no seu provedor de domínio:

**Registro MX:**
```
Type: MX
Name: @
Value: feedback-smtp.us-east-1.amazonses.com
Priority: 10
```

**Registro TXT (SPF):**
```
Type: TXT
Name: @
Value: v=spf1 include:amazonses.com ~all
```

**Registro TXT (DKIM):**
```
Type: TXT
Name: resend._domainkey
Value: [valor fornecido pelo Resend]
```

#### Passo 3: Verificar
1. Aguarde propagação DNS (pode levar até 48h, geralmente 1-2h)
2. Clique em "Verify" no painel do Resend
3. Após verificado, atualize as variáveis de ambiente:

```env
EMAIL_FROM=noreply@seudominio.com
RESEND_VERIFIED_DOMAIN=true
```

### Opção 2: Encaminhamento Automático no Gmail

#### Configurar encaminhamento de maxonu2023@gmail.com para alsj1520@gmail.com:

1. Acesse Gmail: https://mail.google.com (maxonu2023@gmail.com)
2. Clique no ícone de engrenagem → "Ver todas as configurações"
3. Vá para a aba "Encaminhamento e POP/IMAP"
4. Clique em "Adicionar um endereço de encaminhamento"
5. Digite: alsj1520@gmail.com
6. Clique em "Avançar" → "Continuar"
7. Um email de confirmação será enviado para alsj1520@gmail.com
8. Abra o email e clique no link de confirmação
9. Volte para as configurações do Gmail (maxonu2023@gmail.com)
10. Selecione "Encaminhar uma cópia da mensagem recebida para alsj1520@gmail.com"
11. Escolha "manter cópia no Gmail" ou "excluir cópia do Gmail"
12. Clique em "Salvar alterações"

✅ Agora todos os emails que chegarem em maxonu2023@gmail.com serão automaticamente encaminhados para alsj1520@gmail.com

### Opção 3: Adicionar Filtro no Gmail

Se preferir encaminhar apenas emails específicos:

1. Acesse Gmail (maxonu2023@gmail.com)
2. Clique na seta para baixo na barra de pesquisa
3. Configure o filtro:
   - **De:** onboarding@resend.dev
   - **Assunto:** Servidor MaxOnu 2026
4. Clique em "Criar filtro"
5. Marque "Encaminhar para" e selecione alsj1520@gmail.com
6. Clique em "Criar filtro"

## Variáveis de Ambiente

### Desenvolvimento (.env local)
```env
RESEND_API_KEY=re_4gQZ8bWr_BLo8FZtH9yfa57JEGKxwMKWo
EMAIL_FROM=onboarding@resend.dev
# RESEND_VERIFIED_DOMAIN=true  # Descomente após verificar domínio
```

### Produção (Render)
```env
RESEND_API_KEY=re_4gQZ8bWr_BLo8FZtH9yfa57JEGKxwMKWo
EMAIL_FROM=onboarding@resend.dev
# RESEND_VERIFIED_DOMAIN=true  # Adicione após verificar domínio
```

## Testando

Após configurar, teste localmente:
```bash
npm start
```

Você deve ver:
```
✉️  Email de teste enviado com sucesso via Resend!
```

## Troubleshooting

### Email não chega
- Verifique spam/lixo eletrônico
- Confirme que RESEND_API_KEY está correto
- Verifique logs do servidor

### Erro 403 (validation_error)
- Você está tentando enviar para um email não autorizado
- Solução: Verifique um domínio ou use apenas maxonu2023@gmail.com

### Timeout
- Resend usa HTTP, não deve dar timeout
- Verifique conexão com internet
- Verifique se a API key está válida

## Limites do Resend

### Plano Gratuito
- ✅ 100 emails/dia
- ✅ 3,000 emails/mês
- ⚠️ Apenas para email da conta (sem domínio verificado)
- ✅ API HTTP (rápido e confiável)

### Com Domínio Verificado
- ✅ Enviar para qualquer email
- ✅ Email personalizado (seu@seudominio.com)
- ✅ Melhor reputação de entrega
- ✅ Sem marca "via resend.dev"

## Suporte

- Documentação Resend: https://resend.com/docs
- Verificar domínio: https://resend.com/domains
- API Reference: https://resend.com/docs/api-reference/emails/send-email
