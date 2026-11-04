# 📌 Fun Place

A company noticeboard / mini social app. Post thoughts as sticky notes, tag colleagues, react, and poke people as many times as you like.

**Stack:** plain HTML/CSS/JS · Supabase (auth, Postgres, realtime) · Vercel (static hosting, auto-deploys from `main`)

## Features
- Email + password sign-up / login (Supabase Auth) with display name, department and emoji avatar
- Sticky-note posts with a vibe emoji and note colour
- Tag colleagues on posts (they get a realtime toast + inbox entry)
- Unlimited pokes, with a "most poked" leaderboard and poke-back from the inbox
- Emoji reactions
- Filters: everything / tagged me / my posts
- Live updates via Supabase Realtime

## Database
Tables: `profiles`, `posts`, `post_tags`, `reactions`, `pokes`, plus the `poke_stats` view. All tables have Row Level Security: signed-in users can read everything, and can only write as themselves (and only tag on their own posts).

A trigger on `auth.users` creates the `profiles` row from the sign-up metadata.

## Config
`config.js` holds the Supabase URL and **publishable** key (safe in the browser; RLS protects the data).

## Local dev
Any static server works:
```bash
npx serve .
```
