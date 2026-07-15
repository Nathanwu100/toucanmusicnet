// Toucan Music — configuration
//
// Use only a Supabase publishable/anon key here. It is designed for browser
// use and relies on the row-level policies in supabase/schema.sql. Never put
// a secret key or service-role key in this file.
//
// On localhost the site runs in local demo mode: accounts, events, and
// volunteer signups are stored in this browser's localStorage. The demo-only
// admin account is documented in README.md.

window.TOUCAN_CONFIG = {
  PUBLIC_SITE_URL: "https://toucan-music.com",
  SUPABASE_URL: "https://vxjewlbbsdvhzpibkppg.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_2kLFCF1SHANnilcFEWQ7LQ_r4l7lAXP",

  // The admin logs in by name ("admin"); this is the email that name maps
  // to in Supabase auth. Create this user during setup (see README.md).
  ADMIN_EMAIL: "admin@toucanmusic.org",
  ADMIN_NAME: "admin",
};
