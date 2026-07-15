// Toucan Music — data layer.
// Uses Supabase when js/config.js has real credentials; localhost and missing
// credentials run a localStorage-backed demo so the site works without a backend.

(function () {
  const cfg = window.TOUCAN_CONFIG || {};
  const localHosts = ["localhost", "127.0.0.1", "::1", ""];
  const LOCAL_DEMO =
    cfg.FORCE_DEMO === true ||
    (cfg.FORCE_DEMO !== false && localHosts.includes(window.location.hostname));
  const DEMO =
    LOCAL_DEMO ||
    !cfg.SUPABASE_URL ||
    cfg.SUPABASE_URL.includes("YOUR-PROJECT") ||
    !window.supabase;

  // ---------------------------------------------------------------- demo db
  const DB_KEY = "toucan_db_v2";
  const SESSION_KEY = "toucan_session_v2";

  function seedDb() {
    const now = new Date();
    const day = (offset, h, m) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, m);
      return d.toISOString();
    };
    return {
      users: [
        {
          id: "admin-1",
          name: "admin",
          email: cfg.ADMIN_EMAIL || "admin@toucanmusic.org",
          password: "toucan2026",
          role: "admin",
          weekly_digest: true,
          class_reminders: true,
          text_notifications: false,
          phone_number: null,
        },
        {
          id: "vol-1",
          name: "Maya Rivera",
          email: "maya@example.com",
          password: "toucan2026",
          role: "volunteer",
          weekly_digest: true,
          class_reminders: true,
        },
        {
          id: "vol-2",
          name: "Jordan Lee",
          email: "jordan@example.com",
          password: "toucan2026",
          role: "volunteer",
          weekly_digest: true,
          class_reminders: true,
        },
        {
          id: "vol-3",
          name: "Sam Patel",
          email: "sam@example.com",
          password: "toucan2026",
          role: "volunteer",
          weekly_digest: false,
          class_reminders: true,
        },
        {
          id: "student-1",
          name: "Ari Chen",
          email: "ari@example.com",
          password: "toucan2026",
          role: "student",
          weekly_digest: true,
          class_reminders: true,
        },
      ],
      events: [
        {
          id: "ev-1",
          title: "Beginner strings ensemble",
          description: "Violin and cello basics for ages 8-12. Instruments are provided by the lending library.",
          event_type: "class",
          starts_at: day(1, 16, 0),
          ends_at: day(1, 17, 30),
          location: "Room A - Community Center",
          volunteer_capacity: 3,
        },
        {
          id: "ev-2",
          title: "Rhythm & percussion workshop",
          description: "Hand drums, shakers, and body percussion. High energy, with extra volunteer hands welcome.",
          event_type: "class",
          starts_at: day(3, 15, 30),
          ends_at: day(3, 17, 0),
          location: "Main Hall",
          volunteer_capacity: 4,
        },
        {
          id: "ev-3",
          title: "Voice and chorus rehearsal",
          description: "A small-group singing class focused on confidence, breathing, and learning one showcase song.",
          event_type: "class",
          starts_at: day(4, 16, 30),
          ends_at: day(4, 17, 45),
          location: "Music Room B",
          volunteer_capacity: 2,
        },
        {
          id: "ev-4",
          title: "Instrument lending library check-out",
          description: "Students pick up season instruments. Volunteers help tune, label, and fit cases before families head home.",
          event_type: "event",
          starts_at: day(5, 13, 0),
          ends_at: day(5, 15, 0),
          location: "Library Annex",
          volunteer_capacity: 5,
        },
        {
          id: "ev-5",
          title: "Family showcase night",
          description: "Students perform what they've been working on this month. Open to families and friends.",
          event_type: "event",
          starts_at: day(6, 18, 0),
          ends_at: day(6, 20, 0),
          location: "Main Hall",
          volunteer_capacity: 6,
        },
        {
          id: "ev-6",
          title: "Volunteer orientation",
          description: "New volunteers learn how calendar signups, class reminders, and room support work.",
          event_type: "event",
          starts_at: day(8, 17, 30),
          ends_at: day(8, 18, 30),
          location: "Welcome Desk",
          volunteer_capacity: 2,
        },
        {
          id: "ev-7",
          title: "Repair and retune night",
          description: "Donated instruments get cleaned, repaired, and tuned before going back into student hands.",
          event_type: "event",
          starts_at: day(10, 18, 0),
          ends_at: day(10, 20, 30),
          location: "Workshop",
          volunteer_capacity: 4,
        },
      ],
      signups: [
        { id: "su-1", event_id: "ev-1", user_id: "vol-1", user_name: "Maya Rivera" },
        { id: "su-2", event_id: "ev-1", user_id: "vol-2", user_name: "Jordan Lee" },
        { id: "su-3", event_id: "ev-2", user_id: "vol-1", user_name: "Maya Rivera" },
        { id: "su-4", event_id: "ev-3", user_id: "vol-2", user_name: "Jordan Lee" },
        { id: "su-5", event_id: "ev-3", user_id: "vol-3", user_name: "Sam Patel" },
        { id: "su-6", event_id: "ev-4", user_id: "vol-1", user_name: "Maya Rivera" },
        { id: "su-7", event_id: "ev-5", user_id: "vol-2", user_name: "Jordan Lee" },
        { id: "su-8", event_id: "ev-6", user_id: "vol-1", user_name: "Maya Rivera" },
        { id: "su-9", event_id: "ev-6", user_id: "vol-3", user_name: "Sam Patel" },
      ], // { id, event_id, user_id, user_name }
    };
  }

  function loadDb() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const db = seedDb();
    saveDb(db);
    return db;
  }
  function saveDb(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }
  function uid() {
    return "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function demoSessionUser(db = loadDb()) {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const { userId } = JSON.parse(raw);
      return db.users.find((user) => user.id === userId) || null;
    } catch (error) {
      return null;
    }
  }

  function requireDemoAdmin() {
    const db = loadDb();
    const currentUser = demoSessionUser(db);
    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Admin access required.");
    }
    return { db, currentUser };
  }

  // ------------------------------------------------------------- supabase
  let sb = null;
  if (!DEMO) {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  async function requireSupabaseSession() {
    const { data, error } = await sb.auth.getSession();
    if (error || !data.session) throw new Error("Log in with an admin account to continue.");
    return data.session.user;
  }

  // Fetch the profile, creating it on first login from the signup metadata
  // (Supabase no longer allows triggers on auth.users, so this replaces the
  // old on-signup trigger). The RLS insert policy clamps roles to
  // student/volunteer.
  async function sbProfile(authUser) {
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;

    const meta = authUser.user_metadata || {};
    const profile = {
      id: authUser.id,
      full_name: meta.full_name || "Member",
      role: meta.role === "volunteer" ? "volunteer" : "student",
    };
    const { data: created, error: insErr } = await sb
      .from("profiles")
      .insert(profile)
      .select()
      .single();
    if (insErr) throw insErr;
    return created;
  }

  function publicUser(u) {
    return {
      id: u.id,
      name: u.name || u.full_name,
      email: u.email,
      role: u.role,
      weekly_digest: u.weekly_digest,
      class_reminders: u.class_reminders,
      text_notifications: u.text_notifications,
      phone_number: u.phone_number,
    };
  }

  function loginEmail(identifier) {
    const ident = identifier.trim();
    return ident.toLowerCase() === String(cfg.ADMIN_NAME || "admin").toLowerCase()
      ? cfg.ADMIN_EMAIL
      : ident;
  }

  function confirmationRedirectUrl() {
    const siteUrl = cfg.PUBLIC_SITE_URL || window.location.origin;
    return new URL("/login?confirmed=1", siteUrl).href;
  }

  // ------------------------------------------------------------------ api
  const api = {
    demoMode: DEMO,

    async getSession() {
      if (DEMO) {
        const u = demoSessionUser();
        return u ? publicUser(u) : null;
      }
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      const p = await sbProfile(data.session.user);
      return publicUser({ ...p, email: data.session.user.email });
    },

    // identifier: email, or the admin's name ("admin")
    async login(identifier, password) {
      const ident = identifier.trim();
      if (DEMO) {
        const db = loadDb();
        const u = db.users.find(
          (u) =>
            (u.email.toLowerCase() === ident.toLowerCase() ||
              u.name.toLowerCase() === ident.toLowerCase()) &&
            u.password === password
        );
        if (!u) throw new Error("No account matches that name/email and password.");
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: u.id }));
        return publicUser(u);
      }
      const email = loginEmail(ident);
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        const loginError = new Error(error.message);
        loginError.code = error.code || (error.message === "Email not confirmed" ? "email_not_confirmed" : "auth_error");
        throw loginError;
      }
      const p = await sbProfile(data.user);
      return publicUser({ ...p, email: data.user.email });
    },

    async resendConfirmation(identifier) {
      if (DEMO) throw new Error("Email confirmation is only used on the deployed site.");
      const email = loginEmail(identifier);
      const { error } = await sb.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: confirmationRedirectUrl() },
      });
      if (error) throw new Error(error.message);
    },

    async signup({ name, email, password, role }) {
      if (!["student", "volunteer"].includes(role)) throw new Error("Pick a role to continue.");
      if (DEMO) {
        const db = loadDb();
        if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase()))
          throw new Error("An account with that email already exists.");
        const u = {
          id: uid(),
          name,
          email,
          password,
          role,
          weekly_digest: true,
          class_reminders: true,
          text_notifications: false,
          phone_number: null,
        };
        db.users.push(u);
        saveDb(db);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: u.id }));
        return publicUser(u);
      }
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: confirmationRedirectUrl(),
          data: { full_name: name, role },
        },
      });
      if (error) throw new Error(error.message);
      return publicUser({ id: data.user.id, name, email, role, weekly_digest: true, class_reminders: true, text_notifications: false, phone_number: null });
    },

    async logout() {
      if (DEMO) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
      await sb.auth.signOut();
    },

    async updatePrefs({ weekly_digest, class_reminders, text_notifications, phone_number }) {
      if (DEMO) {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) throw new Error("Not logged in.");
        const { userId } = JSON.parse(raw);
        const db = loadDb();
        const u = db.users.find((u) => u.id === userId);
        if (!u) throw new Error("Your session has expired. Log in again.");
        u.weekly_digest = weekly_digest;
        u.class_reminders = class_reminders;
        u.text_notifications = text_notifications;
        u.phone_number = phone_number || null;
        saveDb(db);
        return publicUser(u);
      }
      const { data: s } = await sb.auth.getSession();
      if (!s.session) throw new Error("Log in to update notification settings.");
      const { data: updated, error } = await sb.rpc("update_notification_preferences", {
        new_weekly_digest: weekly_digest,
        new_class_reminders: class_reminders,
        new_text_notifications: text_notifications,
        new_phone_number: phone_number || null,
      });
      if (error) throw new Error(error.message);
      const profile = Array.isArray(updated) ? updated[0] : updated;
      return publicUser({ ...profile, email: s.session.user.email });
    },

    // ------------------------------------------------------------- events
    async listEvents() {
      if (DEMO) {
        return loadDb().events.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      }
      const { data, error } = await sb.from("events").select("*").order("starts_at");
      if (error) throw new Error(error.message);
      return data;
    },

    async createEvent(ev) {
      if (DEMO) {
        const { db, currentUser } = requireDemoAdmin();
        const row = { id: uid(), ...ev, created_by: currentUser.id };
        db.events.push(row);
        saveDb(db);
        return row;
      }
      const authUser = await requireSupabaseSession();
      const { data, error } = await sb
        .from("events")
        .insert({ ...ev, created_by: authUser.id })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },

    async updateEvent(id, ev) {
      if (DEMO) {
        const { db } = requireDemoAdmin();
        const i = db.events.findIndex((e) => e.id === id);
        if (i < 0) throw new Error("Event not found.");
        db.events[i] = { ...db.events[i], ...ev };
        saveDb(db);
        return db.events[i];
      }
      await requireSupabaseSession();
      const { data, error } = await sb.from("events").update(ev).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return data;
    },

    async deleteEvent(id) {
      if (DEMO) {
        const { db } = requireDemoAdmin();
        if (!db.events.some((event) => event.id === id)) throw new Error("Event not found.");
        db.events = db.events.filter((e) => e.id !== id);
        db.signups = db.signups.filter((s) => s.event_id !== id);
        saveDb(db);
        return;
      }
      await requireSupabaseSession();
      const { error } = await sb.from("events").delete().eq("id", id).select("id").single();
      if (error) throw new Error(error.message);
    },

    // ------------------------------------------------------------ signups
    // Returns { count, mine } for one event. Only volunteers/admin may call.
    async signupStatus(eventId, user) {
      if (DEMO) {
        const db = loadDb();
        const rows = db.signups.filter((s) => s.event_id === eventId);
        return {
          count: rows.length,
          mine: !!user && rows.some((s) => s.user_id === user.id),
        };
      }
      const { count, error } = await sb
        .from("volunteer_signups")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId);
      if (error) throw new Error(error.message);
      let mine = false;
      if (user) {
        const { data } = await sb
          .from("volunteer_signups")
          .select("id")
          .eq("event_id", eventId)
          .eq("volunteer_id", user.id)
          .maybeSingle();
        mine = !!data;
      }
      return { count: count || 0, mine };
    },

    async volunteerSignup(eventId, user) {
      if (DEMO) {
        const db = loadDb();
        const ev = db.events.find((e) => e.id === eventId);
        if (!ev) throw new Error("Event not found.");
        const rows = db.signups.filter((s) => s.event_id === eventId);
        if (rows.some((s) => s.user_id === user.id))
          throw new Error("You're already signed up for this event.");
        if (rows.length >= ev.volunteer_capacity)
          throw new Error("All volunteer spots for this event are filled.");
        db.signups.push({ id: uid(), event_id: eventId, user_id: user.id, user_name: user.name });
        saveDb(db);
        return;
      }
      // Capacity is enforced server-side by a trigger; see supabase/schema.sql.
      const { error } = await sb
        .from("volunteer_signups")
        .insert({ event_id: eventId, volunteer_id: user.id });
      if (error) throw new Error(error.message);
    },

    async volunteerCancel(eventId, user) {
      if (DEMO) {
        const db = loadDb();
        db.signups = db.signups.filter(
          (s) => !(s.event_id === eventId && s.user_id === user.id)
        );
        saveDb(db);
        return;
      }
      const { error } = await sb
        .from("volunteer_signups")
        .delete()
        .eq("event_id", eventId)
        .eq("volunteer_id", user.id);
      if (error) throw new Error(error.message);
    },

    // Admin only: who signed up.
    async listSignups(eventId) {
      if (DEMO) {
        const { db } = requireDemoAdmin();
        return db.signups.filter((s) => s.event_id === eventId);
      }
      const { data, error } = await sb
        .from("volunteer_signups")
        .select("id, volunteer_id, profiles(full_name)")
        .eq("event_id", eventId);
      if (error) throw new Error(error.message);
      return data.map((r) => ({ user_name: r.profiles?.full_name || "Volunteer" }));
    },
  };

  window.ToucanAPI = api;
})();
