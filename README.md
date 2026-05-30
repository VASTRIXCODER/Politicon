# Politicon — AI-Powered Civic Tech Platform

> Your money. Every policy. Crystal clear.

Politicon translates government policies into personalized financial impact. Not political opinion — just the dollar answer.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + custom CSS design system
- **Animations**: Framer Motion + GSAP + Lenis (smooth scroll)
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **AI**: Google Gemini API (gemini-1.5-flash)
- **Icons**: Lucide React

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in your Supabase and Gemini API keys

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `NEXT_PUBLIC_APP_URL` | App URL (for OAuth redirects) |

## Project Structure

```
politicon/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Landing page
│   ├── auth/               # Sign in / Sign up
│   ├── onboarding/         # 11-step profile builder
│   ├── dashboard/          # Authenticated home
│   ├── policies/           # Policy search + analysis
│   ├── advisor/            # AI chat interface
│   ├── impact/             # Cumulative impact dashboard
│   ├── explorer/           # Public impact explorer (no auth)
│   └── api/                # AI API routes
├── components/
│   ├── landing/            # Landing page sections
│   ├── layout/             # Navbar, Footer
│   ├── providers/          # Lenis smooth scroll
│   └── ui/                 # Reusable components
├── lib/
│   ├── supabase/           # Supabase client + server
│   ├── gemini.ts           # Gemini AI wrapper
│   └── utils.ts            # Helper functions
├── mocks/
│   └── policies.ts         # Mock policy data
├── types/
│   └── index.ts            # TypeScript types
└── supabase/
    └── migrations/         # Database schema
```

## Design System

Colors: `#07050F` base • `#7B61FF` primary • `#00D4FF` secondary • `#F5C842` gold

Fonts: Clash Display (display) • Satoshi (body) • JetBrains Mono (data)

All cards use glassmorphism: `backdrop-filter: blur(24px) saturate(180%)`

## Pages

| Route | Description | Auth |
|---|---|---|
| `/` | Landing page | Public |
| `/explorer` | Public impact data | Public |
| `/auth/signin` | Sign in | Public |
| `/auth/signup` | Register | Public |
| `/onboarding` | Profile builder | Public |
| `/dashboard` | Personalized home | Required |
| `/policies` | Policy search + AI analysis | Required |
| `/advisor` | AI chat advisor | Required |
| `/impact` | Cumulative dashboard | Required |
