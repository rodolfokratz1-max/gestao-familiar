# 🚀 GestãoFam — Guia Completo de Deploy

Sistema de gestão financeira familiar com React + Supabase + Vercel.
**Custo: R$ 0/mês** para uso familiar.

---

## 📋 O que você vai precisar

- Conta gratuita no [Supabase](https://supabase.com)
- Conta gratuita no [Vercel](https://vercel.com)
- Conta no [GitHub](https://github.com) (para conectar ao Vercel)
- Node.js instalado (versão 18+): [nodejs.org](https://nodejs.org)
- Git instalado: [git-scm.com](https://git-scm.com)

---

## PASSO 1 — Configurar o banco de dados (Supabase)

### 1.1 Criar o projeto
1. Acesse [supabase.com](https://supabase.com) e clique em **"Start your project"**
2. Faça login com GitHub ou email
3. Clique em **"New project"**
4. Preencha:
   - **Name:** `gestao-familiar`
   - **Database Password:** crie uma senha forte (guarde!)
   - **Region:** `South America (São Paulo)` ← mais rápido no Brasil
5. Clique em **"Create new project"** e aguarde ~2 minutos

### 1.2 Criar as tabelas
1. No painel do Supabase, clique em **"SQL Editor"** no menu lateral
2. Clique em **"New query"**
3. Abra o arquivo `supabase-schema.sql` (que está na pasta do projeto)
4. Copie **todo o conteúdo** e cole no editor SQL
5. Clique em **"Run"** (ou Ctrl+Enter)
6. Você verá a mensagem `Success. No rows returned` — isso é normal!

### 1.3 Pegar as credenciais
1. No menu lateral do Supabase, clique em **"Project Settings"**
2. Clique em **"API"**
3. Anote dois valores:
   - **Project URL** → algo como `https://abcxyz123.supabase.co`
   - **anon public** (em API Keys) → uma chave longa começando com `eyJ...`

---

## PASSO 2 — Configurar o projeto localmente

### 2.1 Instalar dependências
Abra o terminal na pasta do projeto e execute:
```bash
npm install
```

### 2.2 Criar arquivo de configuração
Crie um arquivo chamado `.env` na raiz do projeto (copie do `.env.example`):
```
VITE_SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

Substitua pelos valores que você anotou no Passo 1.3.

### 2.3 Testar localmente
```bash
npm run dev
```
Acesse `http://localhost:5173` — o sistema deve abrir!

---

## PASSO 3 — Publicar online (Vercel)

### 3.1 Subir o código para o GitHub
```bash
# Dentro da pasta do projeto:
git init
git add .
git commit -m "first commit"
```

1. Acesse [github.com](https://github.com) e crie um **novo repositório** (pode ser privado)
2. Copie os comandos que o GitHub mostra para conectar e fazer push:
```bash
git remote add origin https://github.com/SEU_USUARIO/gestao-familiar.git
git branch -M main
git push -u origin main
```

### 3.2 Deploy no Vercel
1. Acesse [vercel.com](https://vercel.com) e faça login com GitHub
2. Clique em **"Add New Project"**
3. Selecione o repositório `gestao-familiar`
4. Em **"Environment Variables"**, adicione as duas variáveis:
   - `VITE_SUPABASE_URL` = `https://SEU_PROJECT_ID.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `sua_anon_key`
5. Clique em **"Deploy"**
6. Aguarde ~1 minuto

Pronto! Você receberá um link como `https://gestao-familiar-xyz.vercel.app` 🎉

---

## PASSO 4 — Acessar em qualquer dispositivo

### No computador
Basta acessar o link do Vercel em qualquer navegador.

### No celular (como app)
O sistema é um **PWA** — pode ser instalado como app:

**Android (Chrome):**
1. Abra o link no Chrome
2. Toque no menu (3 pontos) → **"Adicionar à tela inicial"**

**iPhone (Safari):**
1. Abra o link no Safari
2. Toque no botão de compartilhar (quadrado com seta)
3. Role e toque em **"Adicionar à Tela Inicial"**

### Compartilhar com família
Basta enviar o link do Vercel para os familiares — qualquer pessoa com o link acessa o sistema. Todos veem e editam os mesmos dados em tempo real.

---

## 📦 Estrutura do projeto

```
gestao-familiar/
├── src/
│   ├── lib/
│   │   └── supabase.js          ← conexão com o banco
│   ├── contexts/
│   │   └── ToastContext.jsx     ← notificações
│   ├── components/
│   │   ├── Modal.jsx            ← modal reutilizável
│   │   └── ConfirmDialog.jsx    ← confirmação de exclusão
│   ├── pages/
│   │   ├── Dashboard.jsx        ← visão geral com gráficos
│   │   ├── Pessoas.jsx          ← clientes e fornecedores
│   │   ├── Produtos.jsx         ← produtos e serviços
│   │   ├── Financeiro.jsx       ← receitas, despesas, contas
│   │   ├── Caixa.jsx            ← entradas e saídas
│   │   ├── Compras.jsx          ← registro de compras
│   │   └── Manutencoes.jsx      ← controle de manutenções
│   ├── App.jsx                  ← roteamento e sidebar
│   └── index.css                ← design system completo
├── supabase-schema.sql          ← script do banco de dados
└── .env.example                 ← modelo de configuração
```

---

## ⚙️ Funcionalidades de cada módulo

| Módulo | Incluir | Alterar | Excluir | Ativar/Desativar | Buscar | Filtrar |
|--------|---------|---------|---------|-----------------|--------|---------|
| Clientes/Fornecedores | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Produtos/Serviços | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Receitas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Despesas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Caixa | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| A Receber | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| A Pagar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Compras | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manutenções | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 🔒 Segurança (opcional)

O sistema está configurado para acesso público (qualquer pessoa com o link acessa). Se quiser restringir com login e senha:

1. No Supabase, vá em **Authentication > Providers**
2. Habilite **Email** 
3. Crie usuários em **Authentication > Users**
4. Modifique as policies no SQL para usar `auth.uid()` ao invés de `true`
5. Adicione uma tela de login no React

---

## 🆙 Atualizações futuras

Para adicionar funcionalidades ou corrigir bugs, basta editar os arquivos e executar:
```bash
git add .
git commit -m "descrição da mudança"
git push
```
O Vercel faz o deploy automaticamente em ~1 minuto!

---

## ❓ Problemas comuns

**Erro de conexão com o Supabase:**
- Verifique se o arquivo `.env` tem as variáveis corretas (sem espaços extras)
- Confirme que as policies foram criadas no SQL

**Dados não salvam:**
- Abra o console do navegador (F12) e veja o erro
- Verifique se as tabelas foram criadas corretamente

**Site não abre no celular:**
- Verifique a conexão com internet
- Tente limpar o cache do navegador

---

Desenvolvido com ❤️ usando React + Supabase + Vercel
