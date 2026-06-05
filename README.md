# sistematiza.erp

ERP SaaS multi-tenant para pequenas e médias empresas.

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Next.js API Routes
- **Banco:** PostgreSQL — AWS RDS (Drizzle ORM)
- **Auth:** Clerk
- **Deploy:** Vercel

## Setup de desenvolvimento

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
```bash
cp .env.example .env.local
# Edite .env.local com suas credenciais
```

### 3. Criar o primeiro tenant no banco
```bash
npm run setup
```
Siga as instruções no terminal para criar seu tenant.

### 4. Rodar em desenvolvimento
```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Estrutura do projeto

```
app/
  (auth)/          # Páginas de login e cadastro
  (dashboard)/     # Área autenticada
    [tenant]/      # Dashboard por tenant
  api/[tenant]/    # API Routes por módulo
  onboarding/      # Criação do primeiro tenant
lib/
  db/              # Drizzle ORM + schemas
  auth/            # Resolução de tenant
  api/             # Respostas padronizadas
  services/        # Lógica de negócio
  validations/     # Schemas Zod
  stores/          # Zustand
components/
  layout/          # Sidebar, Header
  modules/         # Componentes por módulo
  ui/              # Componentes base
scripts/           # Scripts de setup
```
