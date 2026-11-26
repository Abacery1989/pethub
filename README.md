# Lolly store (free e-commerce)
Static site (GitHub Pages) + Supabase free (Postgres, Auth, Storage).
- `index.html`, `app.js`, `style.css`: storefront.
- `admin.html`, `admin.js`: store management (login by emailed link, admin email listed in the `admins` table).
- `config.js`: Supabase URL and the public (publishable) key. No secret keys are in this repo.
- Database rules (RLS) and checkout logic live in Supabase; see `schema.sql`.
