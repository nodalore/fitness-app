# Stage 2: Supabase account setup

Status: Stage 2 authorized; stopped at the account-access checkpoint. No Supabase project has been created or changed, no SQL migrations have been applied, and no authentication implementation has been added yet.

## 1. Create or choose a project

Sign in to https://supabase.com/dashboard and create a dedicated development project named Fitness App, or choose an existing empty development project. Choose a suitable region and retain the database password in your password manager. Do not send that password in chat. Review the plan and costs before selecting a paid service.

A dedicated development project lets us test security without affecting production data. Tell the agent whether the project is new/empty or already contains tables; existing projects need a schema review before applying changes.

## 2. Configure the frontend's public project values

In the project's Connect panel, find the project URL and publishable API key. Copy `.env.example` to `.env.local` inside `~/fitness-app` and fill in:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

These are browser configuration, not administrative credentials. `.env.local` is ignored by Git. Never place a service-role key, secret API key, database password, or Supabase personal access token in a `VITE_` variable. No application changes use these values until implementation resumes. Restart Vite after future environment changes.

## 3. Choose how database migrations will be applied

The frontend's publishable key cannot create tables, configure authentication, or install security policies. Choose one workflow:

- **Dashboard workflow:** the agent prepares versioned SQL files inside this project; you review and run them in the Supabase SQL Editor and return the result. This avoids giving the agent administrative credentials. Wait for the project's actual migration files; do not create sample tutorial tables.
- **Connected-tool workflow:** connect and authorize a Supabase integration for this development project, if available in your environment. Let the agent verify the available tools and permission scope before running migrations.

No Supabase integration or CLI is currently available in the session. Do not install or authenticate tools outside `~/fitness-app` as part of this task without changing the project-location constraint. If a CLI workflow is later selected, agree on a project-local setup and secure authentication method first.

## 4. Configure email authentication

Under Authentication, enable email/password sign-in and keep email confirmation enabled. For local testing, set the Site URL to:

```text
http://127.0.0.1:5173
```

The Stage 2 implementation will use these exact redirect URLs; add them to the permitted redirect list:

```text
http://127.0.0.1:5173/auth/callback
http://127.0.0.1:5173/auth/reset-password
```

Those pages are planned, not implemented yet. Use the same `127.0.0.1` origin in the browser; `localhost` is a different origin and needs separate configuration if used. For public deployment later, replace the Site URL with the production HTTPS origin and add that origin's exact callback/reset paths. Avoid broad production wildcard redirects.

Supabase's default email service restricts delivery and is unsuitable for public production use. For public sign-up and recovery, configure custom SMTP under Authentication with your email provider's verified sender/domain and credentials. Enter SMTP secrets in Supabase, not in frontend files or chat. For initial testing without custom SMTP, use permitted project-team recipient addresses and observe provider rate limits; do not disable email confirmation as a shortcut.

## 5. What happens after access is ready

The agent will implement and verify Stage 2 only:

1. Versioned schema migrations with constraints and ownership relationships from SPEC.md.
2. Row-level security policies and a small curated reference seed.
3. Supabase client configuration and sign-up, verification callback, sign-in, sign-out, password recovery, and profile persistence.
4. Security tests using anonymous access and two separate test users. Tests must target this dedicated development project and clean up only their own fixtures.
5. Automated frontend checks plus real authentication, persistence, and cross-account isolation verification. Missing live checks must be reported as unverified.

Do not send test account passwords in chat. The agent will agree on local test configuration when the security tests are ready. Stage 3 recommendation and routine-editing features require separate approval.

## Official references

- React setup and public configuration: https://supabase.com/docs/guides/getting-started/quickstarts/reactjs
- Email/password authentication: https://supabase.com/docs/guides/auth/passwords
- Redirect allowlists: https://supabase.com/docs/guides/auth/redirect-urls
- Production email configuration: https://supabase.com/docs/guides/auth/auth-smtp
- Database security: https://supabase.com/docs/guides/database/postgres/row-level-security

Documentation checked 2026-10-17. Dashboard labels can change; use the linked official pages if settings move.
