# Correções de Notificações no Header - MaxOnu 2026

## Resumo das Alterações

Este documento descreve as correções implementadas para resolver problemas de exibição das notificações no header do MaxOnu, tanto em dispositivos desktop quanto mobile.

## Problemas Identificados e Corrigidos

### 1. **Posicionamento Incorreto do Painel no Desktop**
   - **Problema**: O painel de notificações estava com `position: absolute` mas sem `pointer-events: auto` e `visibility: visible`, causando problemas de interação.
   - **Solução**: Adicionados os atributos `pointer-events: auto` e `visibility: visible` ao painel.

### 2. **Overlay Bloqueando o Painel no Mobile**
   - **Problema**: O overlay estava com `inset: 0` (ocupando toda a tela), impedindo a interação com o painel de notificações no mobile.
   - **Solução**: 
     - Adicionado `top: var(--mx-header-height)` ao overlay para que ele não cubra o header.
     - No mobile (max-width: 1024px), o overlay também começa abaixo do header com `top: 0` dentro da media query.

### 3. **Painel não Aparecia Corretamente no Mobile**
   - **Problema**: O painel no mobile estava com `position: fixed; inset: 0` mas sem `pointer-events: auto`, causando problemas de clique.
   - **Solução**: Adicionados `pointer-events: auto` e `visibility: visible` ao painel mobile.

### 4. **Badge de Notificações não Atualiza em Tempo Real**
   - **Problema**: O método `refreshBadgeOnly()` não estava sendo chamado corretamente quando o painel estava fechado.
   - **Solução**: 
     - Melhorado o método `connectStream()` para garantir que o badge seja atualizado quando o painel está fechado.
     - Adicionado tratamento de erro no `refreshBadgeOnly()` para resetar o badge se houver erro.

### 5. **Scroll do Body não Bloqueado Quando Painel Aberto**
   - **Problema**: Quando o painel de notificações era aberto no mobile, o usuário ainda podia fazer scroll da página.
   - **Solução**: Adicionado `document.body.style.overflow = 'hidden'` e classe `mx-header-lock` quando o painel é aberto.

### 6. **Listeners de Clique Fora do Painel não Funcionavam**
   - **Problema**: O painel não fechava ao clicar fora dele em algumas situações.
   - **Solução**: 
     - Adicionado listener no overlay para fechar o painel ao clicar nele.
     - Melhorado o tratamento da tecla ESC para fechar o painel antes do menu.

## Arquivos Modificados

### `/public/css/layout/header.css`
- Adicionados `pointer-events: auto` e `visibility: visible` ao `.mx-header__notif-panel:not([hidden])`
- Adicionado `top: var(--mx-header-height)` ao `.mx-header__notif-overlay:not([hidden])`
- Adicionado `top: var(--mx-header-height)` ao `.mx-header__notif-overlay.is-open`
- Adicionadas regras para mobile no `@media (max-width: 1024px)` para o overlay começar abaixo do header
- Adicionados `pointer-events: auto`, `visibility: visible` e coordenadas explícitas ao painel mobile

### `/public/js/header.js`
- **Classe `HeaderNotifications`**:
  - Melhorado `setPanelOpen()` para gerenciar corretamente o overlay com `removeAttribute` e `setAttribute`
  - Adicionado bloqueio de scroll do body quando painel está aberto
  - Melhorado `closePanel()` para remover a classe `mx-header-lock`
  - Melhorado `connectStream()` para garantir atualização do badge quando painel está fechado
  - Adicionado tratamento de erro em `refreshBadgeOnly()`

- **Classe `HeaderController`**:
  - Adicionado listener para fechar o painel ao clicar no overlay
  - Melhorado tratamento da tecla ESC para fechar painel antes do menu

## Testes Recomendados

1. **Desktop (1025px+)**:
   - Abrir painel de notificações
   - Verificar se o painel aparece corretamente abaixo do header
   - Clicar fora do painel e verificar se fecha
   - Pressionar ESC e verificar se fecha

2. **Mobile (até 1024px)**:
   - Abrir painel de notificações
   - Verificar se o painel ocupa toda a tela
   - Verificar se o scroll da página está bloqueado
   - Clicar no overlay e verificar se fecha
   - Pressionar ESC e verificar se fecha

3. **Notificações em Tempo Real**:
   - Abrir painel e receber uma notificação
   - Verificar se a notificação aparece na lista
   - Fechar painel e receber uma notificação
   - Verificar se o badge é atualizado corretamente

## Notas Técnicas

- O sistema usa EventSource (SSE) para atualizar notificações em tempo real
- O overlay é gerenciado dinamicamente via JavaScript
- O painel tem comportamento diferente em desktop (dropdown) vs mobile (fullscreen)
- O badge é atualizado via `refreshBadgeOnly()` quando o painel está fechado
- A classe `mx-header-lock` é usada para bloquear scroll do body

## Data das Correções

**Data**: 12 de maio de 2026
**Versão**: 1.0

