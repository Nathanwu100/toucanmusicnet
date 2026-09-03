// Toucan Music — data layer.
// Supabase is the production source of truth. Localhost uses the same behavior
// with a localStorage-backed demo so the complete account flow can be tested
// without production credentials.

(function () {
  const cfg = window.TOUCAN_CONFIG || {};
  const localHosts = ["localhost", "127.0.0.1", "::1", ""];
  const LOCAL_DEMO =
    cfg.FORCE_DEMO === true ||
    (cfg.FORCE_DEMO !== false && localHosts.includes(window.location.hostname));
  // Why demo mode was chosen, so a failure can be named instead of guessed
  // at. "library-missing" is the dangerous one: the config asks for Supabase
  // but the client script never arrived, so the site silently becomes a
  // browser-local sandbox where signups go nowhere and no email is ever sent.
  const CONFIGURED_FOR_SUPABASE = Boolean(
    cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-PROJECT") && cfg.SUPABASE_ANON_KEY
  );
  const DEMO_REASON =
    cfg.FORCE_DEMO === true ? "forced"
    : LOCAL_DEMO ? "localhost"
    : !CONFIGURED_FOR_SUPABASE ? "not-configured"
    : !window.supabase ? "library-missing"
    : null;
  const DEMO = DEMO_REASON !== null;

  // Dropdowns label each option with the name alone, so the catalog carries
  // no descriptive text; schema.sql seeds a null description to match.
  const INSTRUMENTS = [
    { slug: "piano", name: "Piano", description: null, sort_order: 10 },
    { slug: "violin", name: "Violin", description: null, sort_order: 20 },
    { slug: "viola", name: "Viola", description: null, sort_order: 30 },
  ];

  // A new key intentionally resets older demo data that still carries the
  // retired strings, percussion, and voice tracks.
  const DB_KEY = "toucan_db_v4";
  const SESSION_KEY = "toucan_session_v4";

  function seedDb() {
    const now = new Date();
    const day = (offset, h, m) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, m);
      return d.toISOString();
    };
    return {
      instruments: INSTRUMENTS.map((instrument) => ({ ...instrument, active: true })),
      users: [
        {
          id: "admin-1", name: "admin", email: cfg.ADMIN_EMAIL || "admin@toucanmusic.org",
          password: "toucan2026", role: "admin", instrument: null,
          weekly_digest: true, class_reminders: true, text_notifications: false, phone_number: null,
        },
        {
          id: "vol-1", name: "Maya Rivera", email: "maya@example.com",
          password: "toucan2026", role: "volunteer", instrument: null,
          weekly_digest: true, class_reminders: true, text_notifications: false, phone_number: null,
        },
        {
          id: "vol-2", name: "Jordan Lee", email: "jordan@example.com",
          password: "toucan2026", role: "volunteer", instrument: null,
          weekly_digest: true, class_reminders: true, text_notifications: false, phone_number: null,
        },
        {
          id: "vol-3", name: "Sam Patel", email: "sam@example.com",
          password: "toucan2026", role: "volunteer", instrument: null,
          weekly_digest: false, class_reminders: true, text_notifications: false, phone_number: null,
        },
        {
          id: "student-1", name: "Ari Chen", email: "ari@example.com",
          password: "toucan2026", role: "student", instrument: "violin",
          weekly_digest: true, class_reminders: true, text_notifications: false, phone_number: null,
        },
      ],
      events: [
        {
          id: "ev-1", time_slot_id: "slot-1", title: "Beginner violin ensemble",
          description: "Violin basics for ages 8-12. Posture, bowing, and first songs played together.",
          event_type: "class", instruments: ["violin"], starts_at: day(1, 16, 0), ends_at: day(1, 17, 30),
          location: "Room A - Community Center", volunteer_capacity: 3,
          student_capacity: 8, enrollment_open: true,
        },
        {
          id: "ev-2", time_slot_id: "slot-2", title: "Piano foundations workshop",
          description: "Keyboard skills, rhythm, and first chords. High energy, with extra volunteer hands welcome.",
          event_type: "class", instruments: ["piano"], starts_at: day(3, 15, 30), ends_at: day(3, 17, 0),
          location: "Main Hall", volunteer_capacity: 4, student_capacity: 10, enrollment_open: true,
        },
        {
          id: "ev-3", time_slot_id: "slot-3", title: "Strings ensemble rehearsal",
          description: "A small-group class for violin and viola students focused on tone, listening, and learning one showcase piece.",
          event_type: "class", instruments: ["violin", "viola"], starts_at: day(4, 16, 30), ends_at: day(4, 17, 45),
          location: "Music Room B", volunteer_capacity: 2, student_capacity: 6, enrollment_open: true,
        },
        {
          id: "ev-4", time_slot_id: "slot-4", title: "Violin open practice afternoon",
          description: "Practice rooms are open for violin students. Volunteers help set up stands and keep sessions on track.",
          event_type: "event", instruments: ["violin"], starts_at: day(5, 13, 0), ends_at: day(5, 15, 0),
          location: "Library Annex", volunteer_capacity: 5, student_capacity: 0, enrollment_open: false,
        },
        {
          id: "ev-5", time_slot_id: "slot-5", title: "Family showcase night",
          description: "Piano students perform what they have been working on this month. Open to families and friends.",
          event_type: "event", instruments: ["piano"], starts_at: day(6, 18, 0), ends_at: day(6, 20, 0),
          location: "Main Hall", volunteer_capacity: 6, student_capacity: 0, enrollment_open: false,
        },
        {
          id: "ev-6", time_slot_id: "slot-6", title: "Viola volunteer orientation",
          description: "New volunteers learn how room support works for the viola program.",
          event_type: "event", instruments: ["viola"], starts_at: day(8, 17, 30), ends_at: day(8, 18, 30),
          location: "Welcome Desk", volunteer_capacity: 2, student_capacity: 0, enrollment_open: false,
        },
        {
          id: "ev-7", time_slot_id: "slot-7", title: "Showcase stage setup night",
          description: "Volunteers prepare the hall, chairs, and stands before the next violin student showcase.",
          event_type: "event", instruments: ["violin"], starts_at: day(10, 18, 0), ends_at: day(10, 20, 30),
          location: "Workshop", volunteer_capacity: 4, student_capacity: 0, enrollment_open: false,
        },
      ],
      volunteerSignups: [
        { id: "su-1", event_id: "ev-1", user_id: "vol-1", user_name: "Maya Rivera" },
        { id: "su-2", event_id: "ev-1", user_id: "vol-2", user_name: "Jordan Lee" },
        { id: "su-3", event_id: "ev-2", user_id: "vol-1", user_name: "Maya Rivera" },
        { id: "su-4", event_id: "ev-3", user_id: "vol-2", user_name: "Jordan Lee" },
        { id: "su-5", event_id: "ev-3", user_id: "vol-3", user_name: "Sam Patel" },
      ],
      studentEnrollments: [],
    };
  }

  // Stored demo databases created before an instrument was added to the
  // catalog gain the new entries, and events saved when a class taught a
  // single instrument move onto the instruments array -- all without losing
  // accounts or enrollments.
  function upgradeDb(db) {
    let changed = false;
    const known = new Set((db.instruments || []).map((item) => item.slug));
    const missing = INSTRUMENTS.filter((item) => !known.has(item.slug));
    if (missing.length) {
      db.instruments = [...(db.instruments || []), ...missing.map((item) => ({ ...item, active: true }))];
      changed = true;
    }
    for (const event of db.events || []) {
      if (!Array.isArray(event.instruments)) {
        event.instruments = event.instrument ? [event.instrument] : ["violin"];
        delete event.instrument;
        changed = true;
      }
    }
    if (changed) saveDb(db);
    return db;
  }

  function loadDb() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return upgradeDb(JSON.parse(raw));
    } catch (error) {
      // A fresh demo database is safe when storage is unavailable or corrupt.
    }
    const db = seedDb();
    saveDb(db);
    return db;
  }

  function saveDb(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  // Mirrors the profiles_phone_number_format constraint: a leading +, no
  // zero straight after it, digits only, 11 to 16 characters. Entry is made
  // forgiving in js/phone.js; this is the last gate before storage.
  function normalizePhone(value) {
    if (value === null || value === undefined || value === "") return null;
    const digits = String(value).replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15 || digits.startsWith("0")) return null;
    return "+" + digits;
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

  function requireDemoUser(role) {
    const db = loadDb();
    const currentUser = demoSessionUser(db);
    if (!currentUser) throw new Error("Log in to continue.");
    if (role && currentUser.role !== role) throw new Error(`${role === "admin" ? "Admin" : "Student"} access required.`);
    return { db, currentUser };
  }

  function instrumentName(slug, db = null) {
    const instruments = db?.instruments || INSTRUMENTS;
    return instruments.find((item) => item.slug === slug)?.name || null;
  }

  function instrumentNames(slugs, db = null) {
    return (slugs || []).map((slug) => instrumentName(slug, db) || slug);
  }

  // Mirrors the enforce_supported_instrument trigger: every slug must be an
  // active catalog instrument, duplicates collapse, and the result is stored
  // in catalog order so badge order is the same everywhere.
  // Mirrors the class_time_blocks_within_class trigger: a block belongs to a
  // class, sits inside that class's window, and runs forwards. Validating
  // here too means the demo refuses exactly what the database would.
  // A booking described in words, so a notice still reads correctly after the
  // block it refers to has been deleted.
  // Supabase mints block ids on insert. The demo store has no server to do
  // that, so it stamps them here -- the only place a local id is created.
  function withDemoIds(blocks) {
    return (blocks || []).map((block) => (block.id ? block : { ...block, id: uid() }));
  }

  function describeSlot(block, event) {
    if (block) {
      const when = new Date(block.starts_at)
        .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return `${block.label || "Session"} at ${when}`;
    }
    return event?.title || "a class";
  }

  function addNotice(db, studentId, classId, kind, extra = {}) {
    db.notices = db.notices || [];
    db.notices.push({
      id: uid(),
      student_id: studentId,
      class_id: classId,
      kind,
      previous_slot: null,
      new_slot: null,
      note: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
      ...extra,
    });
  }

  function normalizeBlocks(blocks, event) {
    const rows = Array.isArray(blocks) ? blocks : [];
    if (!rows.length) return [];
    if (event.event_type !== "class") {
      throw new Error("Only classes can be divided into time blocks.");
    }
    const classStart = new Date(event.starts_at).getTime();
    const classEnd = new Date(event.ends_at || event.starts_at).getTime();
    const taught = event.instruments || [];
    return rows
      .map((block) => {
        const startsAt = new Date(block.starts_at).getTime();
        const endsAt = new Date(block.ends_at).getTime();
        if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
          throw new Error("Give every time block a start and an end.");
        }
        if (endsAt <= startsAt) throw new Error("A time block has to end after it starts.");
        if (startsAt < classStart || endsAt > classEnd) {
          throw new Error("Every time block has to sit inside the class's own start and end times.");
        }
        // A block lives in one instrument's column, and only a column the
        // class actually teaches. The enforce_block_within_class trigger
        // says the same thing on the server.
        if (!block.instrument || !taught.includes(block.instrument)) {
          throw new Error("Every time block has to be for an instrument this class teaches.");
        }
        return {
          // A block that has never been saved has no id, and must not be
          // given one here: the server casts this straight to uuid, and a
          // locally minted "id-abc123" fails that cast. Absent means new.
          ...(block.id ? { id: block.id } : {}),
          instrument: block.instrument,
          label: (block.label || "").trim() || "Session",
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          capacity: Math.max(1, parseInt(block.capacity, 10) || 0),
        };
      })
      .sort((left, right) =>
        left.instrument.localeCompare(right.instrument) || left.starts_at.localeCompare(right.starts_at));
  }

  function normalizeInstruments(slugs, db) {
    const requested = new Set(Array.isArray(slugs) ? slugs : []);
    const normalized = db.instruments
      .filter((item) => item.active && requested.has(item.slug))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => item.slug);
    if (!requested.size || normalized.length !== requested.size) {
      throw new Error("Choose supported instruments.");
    }
    return normalized;
  }

  function publicUser(user) {
    return {
      id: user.id,
      name: user.name || user.full_name,
      email: user.email,
      role: user.role,
      instrument: user.instrument || null,
      instrument_name: instrumentName(user.instrument),
      needs_instrument: user.role === "student" && !user.instrument,
      weekly_digest: user.weekly_digest,
      class_reminders: user.class_reminders,
      text_notifications: user.text_notifications,
      phone_number: user.phone_number,
    };
  }

  function activeStudentEnrollments(db, eventId) {
    return db.studentEnrollments.filter((row) => row.class_id === eventId && row.status === "active");
  }

  function overlaps(leftStart, leftEnd, rightStart, rightEnd) {
    const leftFallback = new Date(leftStart).getTime() + 60 * 60 * 1000;
    const rightFallback = new Date(rightStart).getTime() + 60 * 60 * 1000;
    return new Date(leftStart).getTime() < (rightEnd ? new Date(rightEnd).getTime() : rightFallback) &&
      (leftEnd ? new Date(leftEnd).getTime() : leftFallback) > new Date(rightStart).getTime();
  }

  // ------------------------------------------------------------- Supabase
  let sb = null;
  if (!DEMO) sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  async function requireSupabaseSession() {
    const { data, error } = await sb.auth.getSession();
    if (error || !data.session) throw new Error("Log in to continue.");
    return data.session.user;
  }

  async function sbProfile(authUser) {
    const { data, error } = await sb.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
    if (error) throw error;
    if (data) return data;

    const { data: created, error: createError } = await sb.rpc("ensure_current_profile");
    if (createError) throw createError;
    return Array.isArray(created) ? created[0] : created;
  }

  // Supabase auth errors arrive as codes and terse strings. Translate the ones
  // that actually happen here, and keep the code on the error so the pages can
  // branch on it rather than matching English.
  function authError(error, code) {
    const raw = String(error?.message || "");
    const supabaseCode = code || error?.code || "";
    const status = error?.status;
    let message = raw;
    let resolved = supabaseCode;

    if (supabaseCode === "email_exists" || supabaseCode === "user_already_exists" ||
        /already registered|already been registered/i.test(raw)) {
      resolved = "email_exists";
      message = "An account already uses that email address.";
    } else if (supabaseCode === "over_email_send_rate_limit" || status === 429 || /rate limit/i.test(raw)) {
      resolved = "email_rate_limited";
      message = "Too many emails have been sent from this site recently. Wait an hour and try again.";
    } else if (supabaseCode === "email_not_confirmed" || /email not confirmed/i.test(raw)) {
      resolved = "email_not_confirmed";
      message = "This account has not confirmed its email address yet.";
    } else if (supabaseCode === "invalid_credentials" || /invalid login credentials/i.test(raw)) {
      resolved = "invalid_credentials";
      message = "That email and password do not match an account.";
    } else if (/error sending confirmation|error sending email|smtp/i.test(raw)) {
      resolved = "email_send_failed";
      message = "The confirmation email could not be sent. The site's email settings need attention.";
    }

    const wrapped = new Error(message);
    wrapped.code = resolved || "auth_error";
    wrapped.original = raw;
    return wrapped;
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

  function recoveryRedirectUrl() {
    const siteUrl = cfg.PUBLIC_SITE_URL || window.location.origin;
    return new URL("/reset-password", siteUrl).href;
  }

  function normalizeRpcRow(data) {
    return Array.isArray(data) ? data[0] : data;
  }

  const api = {
    demoMode: DEMO,
    demoReason: DEMO_REASON,
    configuredForSupabase: CONFIGURED_FOR_SUPABASE,
    // True when the config names a Supabase project but the app is running on
    // local data anyway -- nothing a visitor does will reach the server.
    get misconfigured() {
      return CONFIGURED_FOR_SUPABASE && DEMO_REASON === "library-missing";
    },
    instruments: INSTRUMENTS.map((instrument) => ({ ...instrument })),

    async listInstruments() {
      if (DEMO) {
        return loadDb().instruments.filter((item) => item.active).sort((a, b) => a.sort_order - b.sort_order);
      }
      const { data, error } = await sb
        .from("instruments")
        .select("slug, name, description, sort_order")
        .eq("active", true)
        .order("sort_order");
      if (error) throw new Error(error.message);
      // The live table may still carry retired rows (voice, percussion,
      // strings) marked active from before the catalog was trimmed down.
      // Enforce the canonical three here so the UI is correct regardless of
      // whether that cleanup has been applied to the database yet.
      const supportedSlugs = new Set(INSTRUMENTS.map((item) => item.slug));
      return data.filter((item) => supportedSlugs.has(item.slug));
    },

    async getSession() {
      if (DEMO) {
        const user = demoSessionUser();
        return user ? publicUser(user) : null;
      }
      const { data, error } = await sb.auth.getSession();
      if (error || !data.session) return null;
      const profile = await sbProfile(data.session.user);
      return publicUser({ ...profile, email: data.session.user.email });
    },

    async login(identifier, password) {
      const ident = identifier.trim();
      if (DEMO) {
        const db = loadDb();
        const user = db.users.find((candidate) =>
          (candidate.email.toLowerCase() === ident.toLowerCase() || candidate.name.toLowerCase() === ident.toLowerCase()) &&
          candidate.password === password
        );
        if (!user) throw new Error("No account matches that name/email and password.");
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
        return publicUser(user);
      }
      const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail(ident), password });
      if (error) throw authError(error);
      const profile = await sbProfile(data.user);
      return publicUser({ ...profile, email: data.user.email });
    },

    // Ask for a reset link. This always reports success, even for an address
    // with no account: telling a stranger which addresses are registered is
    // how account lists get harvested. Supabase behaves the same way.
    async requestPasswordReset(identifier) {
      const email = loginEmail(String(identifier || "").trim());
      if (!email || !email.includes("@")) throw new Error("Enter the email address on the account.");

      if (DEMO) {
        // No mail on localhost, so the link is handed back for the page to
        // show. Only ever reachable in demo mode.
        const db = loadDb();
        const user = db.users.find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());
        if (!user) return { sent: true, demoLink: null };
        const token = uid();
        db.recoveries = (db.recoveries || []).filter((row) => row.userId !== user.id);
        db.recoveries.push({ token, userId: user.id, expires: Date.now() + 60 * 60 * 1000 });
        saveDb(db);
        return { sent: true, demoLink: `reset-password.html?demo_token=${token}` };
      }

      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryRedirectUrl(),
      });
      if (error) throw authError(error);
      return { sent: true, demoLink: null };
    },

    // Whether the reset page should offer the form at all. Checking before
    // rendering it means a dead link says so, instead of inviting someone to
    // choose a password and only then refusing it.
    async hasValidRecovery(demoToken = null) {
      if (DEMO) {
        if (!demoToken) return false;
        const record = (loadDb().recoveries || []).find((row) => row.token === demoToken);
        return Boolean(record && record.expires > Date.now());
      }
      const { data } = await sb.auth.getSession();
      return Boolean(data.session);
    },

    // Called from the reset page. On Supabase the recovery link has already
    // put a session in place by the time this runs, so this is just a password
    // change on the signed-in user.
    async completePasswordReset(newPassword, demoToken = null) {
      if (!newPassword || newPassword.length < 8) {
        throw new Error("Choose a password of at least 8 characters.");
      }

      if (DEMO) {
        const db = loadDb();
        const record = (db.recoveries || []).find((row) => row.token === demoToken);
        if (!record || record.expires < Date.now()) {
          throw new Error("That reset link has expired. Ask for a new one.");
        }
        const user = db.users.find((candidate) => candidate.id === record.userId);
        if (!user) throw new Error("That account no longer exists.");
        user.password = newPassword;
        db.recoveries = db.recoveries.filter((row) => row.token !== demoToken);
        saveDb(db);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
        return publicUser(user);
      }

      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData.session) {
        const expired = new Error("This reset link is no longer valid. Ask for a new one.");
        expired.code = "recovery_expired";
        throw expired;
      }
      const { data, error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw authError(error);
      const profile = await sbProfile(data.user);
      return publicUser({ ...profile, email: data.user.email });
    },

    async resendConfirmation(identifier) {
      if (DEMO) throw new Error("Email confirmation is only used on the deployed site.");
      const { error } = await sb.auth.resend({
        type: "signup",
        email: loginEmail(identifier),
        options: { emailRedirectTo: confirmationRedirectUrl() },
      });
      // Resending to an address that is already confirmed is not a failure
      // worth alarming anyone about -- they can simply log in.
      if (error && /already confirmed|already been confirmed/i.test(error.message || "")) {
        const done = new Error("That address is already confirmed. You can log in.");
        done.code = "already_confirmed";
        throw done;
      }
      if (error) throw authError(error);
    },

    async signup({ name, email, password, role, instrument, phone_number = null }) {
      if (!["student", "volunteer"].includes(role)) throw new Error("Pick a role to continue.");
      // A number offered at signup is what switches texts on. The column and
      // the profiles_text_notification_phone constraint move together: no
      // number means no texts, which is where an account starts anyway.
      const phone = normalizePhone(phone_number);
      if (phone_number && !phone) throw new Error("Enter a valid mobile number, or leave it blank.");
      const supported = await this.listInstruments();
      if (role === "student" && !supported.some((item) => item.slug === instrument)) {
        throw new Error("Select an instrument to finish creating your student account.");
      }
      const selectedInstrument = role === "student" ? instrument : null;

      if (DEMO) {
        const db = loadDb();
        if (db.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
          throw authError(new Error("An account already uses that email address."), "email_exists");
        }
        const user = {
          id: uid(), name, email, password, role, instrument: selectedInstrument,
          weekly_digest: true, class_reminders: true,
          text_notifications: Boolean(phone), phone_number: phone,
        };
        db.users.push(user);
        saveDb(db);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
        return { ...publicUser(user), needs_verification: false };
      }

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: confirmationRedirectUrl(),
          data: { full_name: name, role, instrument: selectedInstrument, phone_number: phone },
        },
      });
      if (error) throw authError(error);
      if (data.session) {
        const profile = await sbProfile(data.user);
        return { ...publicUser({ ...profile, email }), needs_verification: false };
      }
      if (!data.user) throw authError(new Error("Sign-up did not complete. Try again."));

      // A duplicate address comes back in one of two shapes depending on a
      // project setting, and both have to be handled because the setting can
      // be flipped at any time.
      //
      // With "Confirm email" ON, Supabase refuses to error -- that would let
      // anyone test which addresses have accounts -- and instead returns a
      // decoy user with no identities, plus a confirmation_sent_at for mail
      // it never sent. The empty identities array is the only tell, and it is
      // checked here.
      //
      // With "Confirm email" OFF there is no email step to leak through, so
      // it returns a plain 422 user_already_exists, which authError above
      // translates. That path never reaches this line.
      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw authError(new Error("An account already uses that email address."), "email_exists");
      }

      // A genuinely new account with confirmation required. If the mail never
      // left, say so rather than sending them to stare at an empty inbox.
      const mailed = Boolean(data.user.confirmation_sent_at);
      return {
        ...publicUser({
          id: data.user.id, name, email, role, instrument: selectedInstrument,
          weekly_digest: true, class_reminders: true,
          text_notifications: Boolean(phone), phone_number: phone,
        }),
        needs_verification: true,
        confirmation_sent: mailed,
      };
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
        const { db, currentUser } = requireDemoUser();
        currentUser.weekly_digest = weekly_digest;
        currentUser.class_reminders = class_reminders;
        currentUser.text_notifications = text_notifications;
        currentUser.phone_number = phone_number || null;
        saveDb(db);
        return publicUser(currentUser);
      }
      const authUser = await requireSupabaseSession();
      const { data, error } = await sb.rpc("update_notification_preferences", {
        new_weekly_digest: weekly_digest,
        new_class_reminders: class_reminders,
        new_text_notifications: text_notifications,
        new_phone_number: phone_number || null,
      });
      if (error) throw new Error(error.message);
      return publicUser({ ...normalizeRpcRow(data), email: authUser.email });
    },

    async updateInstrument(instrument) {
      if (DEMO) {
        const { db, currentUser } = requireDemoUser("student");
        if (!db.instruments.some((item) => item.slug === instrument && item.active)) {
          throw new Error("Choose a supported instrument.");
        }
        if (currentUser.instrument === instrument) return publicUser(currentUser);
        const active = db.studentEnrollments.find((row) => row.student_id === currentUser.id && row.status === "active");
        if (active) {
          const classTitle = db.events.find((event) => event.id === active.class_id)?.title || "your current class";
          throw new Error(`Leave or transfer your current class “${classTitle}” before changing instruments.`);
        }
        currentUser.instrument = instrument;
        saveDb(db);
        return publicUser(currentUser);
      }
      const authUser = await requireSupabaseSession();
      const { data, error } = await sb.rpc("update_student_instrument", { new_instrument: instrument });
      if (error) throw new Error(error.message);
      return publicUser({ ...normalizeRpcRow(data), email: authUser.email });
    },

    // ------------------------------------------------------------- events
    async listEvents(requestedInstrument = null) {
      if (DEMO) {
        const db = loadDb();
        // The schedule is public, so every caller sees every class and event.
        // The viewer only decides whether is_enrolled can be true.
        const viewer = demoSessionUser(db);
        let rows = db.events;
        if (requestedInstrument) {
          rows = rows.filter((event) => event.instruments.includes(requestedInstrument));
        }
        return rows.map((event) => {
          const active = activeStudentEnrollments(db, event.id);
          return {
            ...event,
            blocks: (event.blocks || []).map((block) => {
              const booked = active.filter((row) => row.block_id === block.id);
              return {
                ...block,
                instrument_name: instrumentName(block.instrument, db),
                taken: booked.length,
                spots_left: Math.max(0, block.capacity - booked.length),
                is_mine: Boolean(viewer) && booked.some((row) => row.student_id === viewer.id),
              };
            }),
            instrument_names: instrumentNames(event.instruments, db),
            active_enrollments: active.length,
            spots_left: Math.max(0, event.student_capacity - active.length),
            is_enrolled: viewer?.role === "student" && active.some((row) => row.student_id === viewer.id),
          };
        }).sort((left, right) => left.starts_at.localeCompare(right.starts_at));
      }

      // Reading the calendar needs no session: list_visible_events is granted to
      // anon and reports is_enrolled false when nobody is logged in.
      const { data, error } = await sb.rpc("list_visible_events", {
        requested_instrument: requestedInstrument || null,
      });
      if (error) throw new Error(error.message);
      return data;
    },

    async createEvent(event) {
      const { blocks, ...fields } = event;
      if (DEMO) {
        const { db, currentUser } = requireDemoUser("admin");
        const instruments = normalizeInstruments(fields.instruments, db);
        const row = {
          id: uid(), time_slot_id: uid(), ...fields, instruments,
          blocks: withDemoIds(normalizeBlocks(blocks, fields)), created_by: currentUser.id,
        };
        db.events.push(row);
        saveDb(db);
        return row;
      }
      const authUser = await requireSupabaseSession();
      const { data, error } = await sb.from("events").insert({ ...fields, created_by: authUser.id }).select().single();
      if (error) throw new Error(error.message);
      await this.saveClassBlocks(data.id, normalizeBlocks(blocks, fields));
      return data;
    },

    // Blocks live in their own table, so they are written separately. The
    // rows a student is booked into are kept: deleting one is refused by
    // guard_block_deletion, and re-sending it unchanged would be a no-op
    // anyway, so only genuinely removed blocks are deleted.
    async saveClassBlocks(classId, blocks) {
      if (DEMO) {
        const { db } = requireDemoUser("admin");
        const event = db.events.find((row) => row.id === classId);
        if (!event) throw new Error("Event not found.");
        // Supabase assigns ids on insert; the demo store has to do it here,
        // which is the only place a local id is allowed to appear.
        blocks = withDemoIds(blocks);
        const before = new Map((event.blocks || []).map((block) => [block.id, block]));
        const keep = new Set(blocks.map((block) => block.id));

        for (const row of activeStudentEnrollments(db, classId)) {
          if (!row.block_id) continue;
          const kept = blocks.find((block) => block.id === row.block_id);
          const was = before.get(row.block_id);
          if (!keep.has(row.block_id)) {
            // The block they were in is gone.
            row.status = "cancelled";
            row.left_at = new Date().toISOString();
            addNotice(db, row.student_id, classId, "slot_changed", {
              previous_slot: describeSlot(was, event),
              note: "That time block was removed from the class.",
            });
          } else if (kept.instrument !== row.instrument) {
            row.status = "cancelled";
            row.left_at = new Date().toISOString();
            addNotice(db, row.student_id, classId, "slot_changed", {
              previous_slot: describeSlot(was, event),
              note: "That time block was moved to a different instrument.",
            });
          } else if (kept.starts_at !== row.class_starts_at || kept.ends_at !== row.class_ends_at) {
            row.class_starts_at = kept.starts_at;
            row.class_ends_at = kept.ends_at;
            addNotice(db, row.student_id, classId, "slot_changed", {
              new_slot: describeSlot(kept, event),
              note: "That time block moved to a new time.",
            });
          }
        }
        event.blocks = blocks;
        saveDb(db);
        return blocks;
      }
      await requireSupabaseSession();
      // One call rather than a delete and an upsert: removing a block has to
      // displace the students in it and file them a notice, and that only
      // works as a single transaction on the server.
      const { error } = await sb.rpc("save_class_blocks", {
        target_class_id: classId,
        blocks,
      });
      if (error) throw new Error(error.message);
      return blocks;
    },

    async updateEvent(id, event) {
      const { blocks, ...event_ } = event;
      if (DEMO) {
        const { db } = requireDemoUser("admin");
        const index = db.events.findIndex((candidate) => candidate.id === id);
        if (index < 0) throw new Error("Event not found.");
        const previous = db.events[index];
        const sameInstruments = JSON.stringify(previous.instruments) === JSON.stringify(event_.instruments);
        const instruments = sameInstruments ? previous.instruments : normalizeInstruments(event_.instruments, db);
        const activeRows = activeStudentEnrollments(db, id);
        const scheduleChanged = previous.starts_at !== event_.starts_at ||
          previous.ends_at !== event_.ends_at || previous.event_type !== event_.event_type;
        if (activeRows.length && scheduleChanged) {
          throw new Error("This class has active student enrollments. Students must leave or transfer before its time slot can change.");
        }
        // Adding instruments is always fine; removing one is only possible
        // while no active student is enrolled for it.
        if (activeRows.some((row) => !instruments.includes(row.instrument))) {
          throw new Error("An active student is enrolled for an instrument this class would no longer teach. Students must leave or transfer first.");
        }
        if (activeRows.length > event_.student_capacity) {
          throw new Error(`Student capacity cannot be lower than the active enrollment count (${activeRows.length}).`);
        }
        db.events[index] = { ...previous, ...event_, instruments };
        saveDb(db);
        if (blocks !== undefined) {
          await this.saveClassBlocks(id, normalizeBlocks(blocks, db.events[index]));
        }
        return db.events[index];
      }
      await requireSupabaseSession();
      const { data, error } = await sb.from("events").update(event_).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      if (blocks !== undefined) await this.saveClassBlocks(id, normalizeBlocks(blocks, data));
      return data;
    },

    async deleteEvent(id) {
      if (DEMO) {
        const { db } = requireDemoUser("admin");
        if (!db.events.some((event) => event.id === id)) throw new Error("Event not found.");
        if (activeStudentEnrollments(db, id).length) {
          throw new Error("This class has active student enrollments. Students must leave or transfer before it can be deleted.");
        }
        db.events = db.events.filter((event) => event.id !== id);
        db.volunteerSignups = db.volunteerSignups.filter((row) => row.event_id !== id);
        db.studentEnrollments = db.studentEnrollments.filter((row) => row.class_id !== id);
        saveDb(db);
        return;
      }
      await requireSupabaseSession();
      const { error } = await sb.from("events").delete().eq("id", id).select("id").single();
      if (error) throw new Error(error.message);
    },

    // Who is in a class, with the contact details an admin needs to reach
    // them. Email lives in auth.users and phone numbers in profiles, neither
    // of which a client can read, so this goes through list_class_roster --
    // one narrow, admin-gated door rather than broad table access.
    // Admin: take a student out of a class. They are told at next login.
    async removeEnrollment(enrollmentId, note = null) {
      if (DEMO) {
        const { db } = requireDemoUser("admin");
        const row = db.studentEnrollments.find((item) => item.id === enrollmentId && item.status === "active");
        if (!row) throw new Error("That enrolment is no longer active.");
        const event = db.events.find((item) => item.id === row.class_id);
        const block = (event?.blocks || []).find((item) => item.id === row.block_id);
        row.status = "cancelled";
        row.left_at = new Date().toISOString();
        addNotice(db, row.student_id, row.class_id, "removed", {
          previous_slot: describeSlot(block, event),
          note,
        });
        saveDb(db);
        return true;
      }
      await requireSupabaseSession();
      const { error } = await sb.rpc("admin_cancel_enrollment", {
        target_enrollment_id: enrollmentId,
        note,
      });
      if (error) throw new Error(error.message);
      return true;
    },

    // Admin: move a student to another class or another slot. The destination
    // is checked the same way a student's own booking would be, so an admin
    // cannot place somebody where they could not have gone themselves.
    async moveEnrollment(enrollmentId, classId, blockId = null, note = null) {
      if (DEMO) {
        const { db } = requireDemoUser("admin");
        const row = db.studentEnrollments.find((item) => item.id === enrollmentId && item.status === "active");
        if (!row) throw new Error("That enrolment is no longer active.");
        const destination = db.events.find((item) => item.id === classId);
        if (!destination || destination.event_type !== "class") throw new Error("That class does not exist.");
        if (!destination.instruments.includes(row.instrument)) {
          throw new Error(`That class does not teach ${instrumentName(row.instrument, db)}.`);
        }
        const blocks = destination.blocks || [];
        let block = null;
        let capacity = destination.student_capacity;
        let startsAt = destination.starts_at;
        let endsAt = destination.ends_at;
        if (blocks.length) {
          if (!blockId) throw new Error("Choose a time block in the new class.");
          block = blocks.find((item) => item.id === blockId);
          if (!block) throw new Error("That time block is not part of that class.");
          if (block.instrument !== row.instrument) {
            throw new Error(`That time block is for ${instrumentName(block.instrument, db)}, not ${instrumentName(row.instrument, db)}.`);
          }
          capacity = block.capacity;
          startsAt = block.starts_at;
          endsAt = block.ends_at;
        } else if (blockId) {
          throw new Error("That class is not divided into time blocks.");
        }
        const taken = db.studentEnrollments.filter((item) =>
          item.status === "active" && item.id !== row.id &&
          (block ? item.block_id === block.id : item.class_id === destination.id)).length;
        if (taken >= capacity) throw new Error("That slot is already full.");
        if (destination.id !== row.class_id && db.studentEnrollments.some((item) =>
          item.status === "active" && item.id !== row.id &&
          item.student_id === row.student_id && item.class_id === destination.id)) {
          throw new Error("That student is already enrolled in that class.");
        }

        const wasEvent = db.events.find((item) => item.id === row.class_id);
        const wasBlock = (wasEvent?.blocks || []).find((item) => item.id === row.block_id);
        const was = describeSlot(wasBlock, wasEvent);

        row.class_id = destination.id;
        row.block_id = block ? block.id : null;
        row.time_slot_id = destination.time_slot_id;
        row.class_starts_at = startsAt;
        row.class_ends_at = endsAt;
        addNotice(db, row.student_id, destination.id, "moved", {
          previous_slot: was,
          new_slot: describeSlot(block, destination),
          note,
        });
        saveDb(db);
        return true;
      }
      await requireSupabaseSession();
      const { error } = await sb.rpc("admin_move_enrollment", {
        target_enrollment_id: enrollmentId,
        destination_class_id: classId,
        destination_block_id: blockId,
        note,
      });
      if (error) throw new Error(error.message);
      return true;
    },

    // What the signed-in student still needs to hear about.
    async listNotices() {
      if (DEMO) {
        const user = demoSessionUser();
        if (!user) return [];
        return (loadDb().notices || [])
          .filter((row) => row.student_id === user.id && !row.resolved_at)
          .sort((left, right) => right.created_at.localeCompare(left.created_at));
      }
      const { data: authData } = await sb.auth.getSession();
      if (!authData.session) return [];
      const { data, error } = await sb.rpc("list_my_notices");
      if (error) throw new Error(error.message);
      return data || [];
    },

    async resolveNotice(noticeId) {
      if (DEMO) {
        const db = loadDb();
        const row = (db.notices || []).find((item) => item.id === noticeId);
        if (row) { row.resolved_at = new Date().toISOString(); saveDb(db); }
        return true;
      }
      await requireSupabaseSession();
      const { error } = await sb.from("student_notices")
        .update({ resolved_at: new Date().toISOString() }).eq("id", noticeId);
      if (error) throw new Error(error.message);
      return true;
    },

    async listClassEnrollments(eventId) {
      if (DEMO) {
        const { db } = requireDemoUser("admin");
        return activeStudentEnrollments(db, eventId).map((row) => {
          const student = db.users.find((user) => user.id === row.student_id);
          const event = db.events.find((item) => item.id === eventId);
          const block = (event?.blocks || []).find((item) => item.id === row.block_id);
          return {
            enrollment_id: row.id,
            student_id: row.student_id,
            student_name: student?.name || "Student",
            email: student?.email || null,
            phone_number: student?.phone_number || null,
            instrument: row.instrument,
            instrument_name: instrumentName(row.instrument, db),
            block_id: row.block_id || null,
            block_label: block?.label || null,
            block_starts_at: block?.starts_at || null,
            block_ends_at: block?.ends_at || null,
            joined_at: row.joined_at,
          };
        }).sort((left, right) =>
          String(left.block_starts_at || "").localeCompare(String(right.block_starts_at || "")) ||
          left.student_name.localeCompare(right.student_name));
      }
      await requireSupabaseSession();
      const { data, error } = await sb.rpc("list_class_roster", { target_class_id: eventId });
      if (error) throw new Error(error.message);
      return data || [];
    },

    async joinClass(eventId, blockId = null) {
      if (DEMO) {
        const { db, currentUser } = requireDemoUser("student");
        const target = db.events.find((event) => event.id === eventId);
        if (!target || target.event_type !== "class") throw new Error("Class not found.");
        if (!currentUser.instrument) throw new Error("Choose an instrument in Settings before joining a class.");
        if (!target.instruments.includes(currentUser.instrument)) throw new Error("This class does not match your selected instrument.");
        if (!target.enrollment_open || new Date(target.starts_at).getTime() <= Date.now()) {
          throw new Error("This class is not open for enrollment.");
        }

        // A class carrying blocks is booked block by block; one without them
        // keeps behaving as a single whole-class place.
        const blocks = target.blocks || [];
        let block = null;
        let capacity = target.student_capacity;
        let slotStart = target.starts_at;
        let slotEnd = target.ends_at;
        if (blocks.length) {
          if (!blockId) throw new Error("Choose a time block for this class.");
          block = blocks.find((row) => row.id === blockId);
          if (!block) throw new Error("That time block is not part of this class.");
          if (block.instrument !== currentUser.instrument) {
            throw new Error(`That time block is for ${instrumentName(block.instrument, db)}, not your instrument.`);
          }
          if (new Date(block.starts_at).getTime() <= Date.now()) {
            throw new Error("That time block has already started.");
          }
          capacity = block.capacity;
          slotStart = block.starts_at;
          slotEnd = block.ends_at;
        } else if (blockId) {
          throw new Error("This class is not divided into time blocks.");
        }

        const existing = db.studentEnrollments.find((row) => row.student_id === currentUser.id && row.class_id === eventId);
        if (existing?.status === "active") throw new Error("You are already enrolled in this class.");
        const conflict = db.studentEnrollments.find((row) =>
          row.student_id === currentUser.id && row.status === "active" && row.class_id !== eventId &&
          overlaps(row.class_starts_at, row.class_ends_at, slotStart, slotEnd)
        );
        if (conflict) throw new Error("This class conflicts with another class on your schedule.");
        const taken = block
          ? activeStudentEnrollments(db, eventId).filter((row) => row.block_id === block.id).length
          : activeStudentEnrollments(db, eventId).length;
        if (taken >= capacity) throw new Error(block ? "That time block is full." : "Class full.");

        // The snapshot records the student's own instrument -- the one of the
        // class's taught instruments they are actually enrolled for.
        const snapshot = {
          block_id: block ? block.id : null,
          instrument: currentUser.instrument, time_slot_id: target.time_slot_id,
          class_starts_at: slotStart, class_ends_at: slotEnd,
          status: "active", joined_at: new Date().toISOString(), left_at: null,
        };
        if (existing) {
          Object.assign(existing, snapshot);
        } else {
          db.studentEnrollments.push({ id: uid(), student_id: currentUser.id, class_id: target.id, ...snapshot });
        }
        saveDb(db);
        return {
          class_id: eventId,
          block_id: block ? block.id : null,
          spots_left: Math.max(0, capacity - taken - 1),
        };
      }
      const { data, error } = await sb.rpc("join_class", {
        target_class_id: eventId,
        target_block_id: blockId,
      });
      if (error) throw authError(error);
      return normalizeRpcRow(data);
    },

    async leaveClass(eventId) {
      if (DEMO) {
        const { db, currentUser } = requireDemoUser("student");
        const target = db.events.find((event) => event.id === eventId);
        const enrollment = db.studentEnrollments.find((row) =>
          row.student_id === currentUser.id && row.class_id === eventId && row.status === "active"
        );
        if (!target) throw new Error("Class not found.");
        if (!enrollment) throw new Error("You are not enrolled in this class.");
        enrollment.status = "cancelled";
        enrollment.left_at = new Date().toISOString();
        saveDb(db);
        return { class_id: eventId, spots_left: Math.max(0, target.student_capacity - activeStudentEnrollments(db, eventId).length) };
      }
      const { data, error } = await sb.rpc("leave_class", { target_class_id: eventId });
      if (error) throw new Error(error.message);
      return normalizeRpcRow(data);
    },

    // ---------------------------------------------------- volunteer signups
    async signupStatus(eventId, user) {
      if (DEMO) {
        const db = loadDb();
        const rows = db.volunteerSignups.filter((row) => row.event_id === eventId);
        return { count: rows.length, mine: !!user && rows.some((row) => row.user_id === user.id) };
      }
      const { count, error } = await sb.from("volunteer_signups").select("*", { count: "exact", head: true }).eq("event_id", eventId);
      if (error) throw new Error(error.message);
      let mine = false;
      if (user) {
        const { data } = await sb.from("volunteer_signups").select("id").eq("event_id", eventId).eq("volunteer_id", user.id).maybeSingle();
        mine = !!data;
      }
      return { count: count || 0, mine };
    },

    async volunteerSignup(eventId, user) {
      if (DEMO) {
        const { db, currentUser } = requireDemoUser();
        if (currentUser.role !== "volunteer" || currentUser.id !== user.id) throw new Error("Volunteer access required.");
        const event = db.events.find((candidate) => candidate.id === eventId);
        if (!event) throw new Error("Event not found.");
        const rows = db.volunteerSignups.filter((row) => row.event_id === eventId);
        if (rows.some((row) => row.user_id === user.id)) throw new Error("You're already signed up for this event.");
        if (rows.length >= event.volunteer_capacity) throw new Error("All volunteer spots for this event are filled.");
        db.volunteerSignups.push({ id: uid(), event_id: eventId, user_id: user.id, user_name: user.name });
        saveDb(db);
        return;
      }
      const { error } = await sb.from("volunteer_signups").insert({ event_id: eventId, volunteer_id: user.id });
      if (error) throw new Error(error.message);
    },

    async volunteerCancel(eventId, user) {
      if (DEMO) {
        const { db, currentUser } = requireDemoUser();
        if (currentUser.id !== user.id) throw new Error("You can only withdraw your own signup.");
        db.volunteerSignups = db.volunteerSignups.filter((row) => !(row.event_id === eventId && row.user_id === user.id));
        saveDb(db);
        return;
      }
      const { error } = await sb.from("volunteer_signups").delete().eq("event_id", eventId).eq("volunteer_id", user.id);
      if (error) throw new Error(error.message);
    },

    async listSignups(eventId) {
      if (DEMO) {
        const { db } = requireDemoUser("admin");
        return db.volunteerSignups.filter((row) => row.event_id === eventId);
      }
      const { data, error } = await sb.from("volunteer_signups").select("id, volunteer_id, profiles(full_name)").eq("event_id", eventId);
      if (error) throw new Error(error.message);
      return data.map((row) => ({ user_name: row.profiles?.full_name || "Volunteer" }));
    },
  };

  window.ToucanAPI = api;
})();
