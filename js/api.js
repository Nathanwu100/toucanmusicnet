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
  const DEMO =
    LOCAL_DEMO ||
    !cfg.SUPABASE_URL ||
    cfg.SUPABASE_URL.includes("YOUR-PROJECT") ||
    !window.supabase;

  const INSTRUMENTS = [
    { slug: "strings", name: "Strings", description: "Violin and cello classes", sort_order: 10 },
    { slug: "percussion", name: "Percussion", description: "Rhythm, drums, and hand percussion", sort_order: 20 },
    { slug: "voice", name: "Voice", description: "Singing and chorus classes", sort_order: 30 },
    { slug: "violin", name: "Violin", description: "Dedicated violin technique and repertoire", sort_order: 40 },
    { slug: "piano", name: "Piano", description: "Piano and keyboard classes", sort_order: 50 },
    { slug: "viola", name: "Viola", description: "Dedicated viola technique and ensemble playing", sort_order: 60 },
  ];

  // A new key intentionally resets older demo data that has no instrument,
  // student-capacity, time-slot, or enrollment information.
  const DB_KEY = "toucan_db_v3";
  const SESSION_KEY = "toucan_session_v3";

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
          password: "toucan2026", role: "student", instrument: "strings",
          weekly_digest: true, class_reminders: true, text_notifications: false, phone_number: null,
        },
      ],
      events: [
        {
          id: "ev-1", time_slot_id: "slot-1", title: "Beginner strings ensemble",
          description: "Violin and cello basics for ages 8-12. Instruments are provided by the lending library.",
          event_type: "class", instrument: "strings", starts_at: day(1, 16, 0), ends_at: day(1, 17, 30),
          location: "Room A - Community Center", volunteer_capacity: 3,
          student_capacity: 8, enrollment_open: true,
        },
        {
          id: "ev-2", time_slot_id: "slot-2", title: "Rhythm & percussion workshop",
          description: "Hand drums, shakers, and body percussion. High energy, with extra volunteer hands welcome.",
          event_type: "class", instrument: "percussion", starts_at: day(3, 15, 30), ends_at: day(3, 17, 0),
          location: "Main Hall", volunteer_capacity: 4, student_capacity: 10, enrollment_open: true,
        },
        {
          id: "ev-3", time_slot_id: "slot-3", title: "Voice and chorus rehearsal",
          description: "A small-group singing class focused on confidence, breathing, and learning one showcase song.",
          event_type: "class", instrument: "voice", starts_at: day(4, 16, 30), ends_at: day(4, 17, 45),
          location: "Music Room B", volunteer_capacity: 2, student_capacity: 6, enrollment_open: true,
        },
        {
          id: "ev-4", time_slot_id: "slot-4", title: "Instrument lending library check-out",
          description: "Students pick up season instruments. Volunteers help tune, label, and fit cases before families head home.",
          event_type: "event", instrument: "strings", starts_at: day(5, 13, 0), ends_at: day(5, 15, 0),
          location: "Library Annex", volunteer_capacity: 5, student_capacity: 0, enrollment_open: false,
        },
        {
          id: "ev-5", time_slot_id: "slot-5", title: "Family showcase night",
          description: "Voice students perform what they have been working on this month. Open to families and friends.",
          event_type: "event", instrument: "voice", starts_at: day(6, 18, 0), ends_at: day(6, 20, 0),
          location: "Main Hall", volunteer_capacity: 6, student_capacity: 0, enrollment_open: false,
        },
        {
          id: "ev-6", time_slot_id: "slot-6", title: "Percussion volunteer orientation",
          description: "New volunteers learn how room support works for the percussion program.",
          event_type: "event", instrument: "percussion", starts_at: day(8, 17, 30), ends_at: day(8, 18, 30),
          location: "Welcome Desk", volunteer_capacity: 2, student_capacity: 0, enrollment_open: false,
        },
        {
          id: "ev-7", time_slot_id: "slot-7", title: "Strings repair and retune night",
          description: "Donated string instruments get cleaned, repaired, and tuned before returning to students.",
          event_type: "event", instrument: "strings", starts_at: day(10, 18, 0), ends_at: day(10, 20, 30),
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
  // catalog gain the new entries without losing accounts or enrollments.
  function withCatalogInstruments(db) {
    const known = new Set((db.instruments || []).map((item) => item.slug));
    const missing = INSTRUMENTS.filter((item) => !known.has(item.slug));
    if (missing.length) {
      db.instruments = [...(db.instruments || []), ...missing.map((item) => ({ ...item, active: true }))];
      saveDb(db);
    }
    return db;
  }

  function loadDb() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return withCatalogInstruments(JSON.parse(raw));
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

  function normalizeRpcRow(data) {
    return Array.isArray(data) ? data[0] : data;
  }

  const api = {
    demoMode: DEMO,
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
      return data;
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
      if (error) {
        const loginError = new Error(error.message);
        loginError.code = error.code || (error.message === "Email not confirmed" ? "email_not_confirmed" : "auth_error");
        throw loginError;
      }
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
      if (error) throw new Error(error.message);
    },

    async signup({ name, email, password, role, instrument }) {
      if (!["student", "volunteer"].includes(role)) throw new Error("Pick a role to continue.");
      const supported = await this.listInstruments();
      if (role === "student" && !supported.some((item) => item.slug === instrument)) {
        throw new Error("Select an instrument to finish creating your student account.");
      }
      const selectedInstrument = role === "student" ? instrument : null;

      if (DEMO) {
        const db = loadDb();
        if (db.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
          throw new Error("An account with that email already exists.");
        }
        const user = {
          id: uid(), name, email, password, role, instrument: selectedInstrument,
          weekly_digest: true, class_reminders: true, text_notifications: false, phone_number: null,
        };
        db.users.push(user);
        saveDb(db);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
        return publicUser(user);
      }

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: confirmationRedirectUrl(),
          data: { full_name: name, role, instrument: selectedInstrument },
        },
      });
      if (error) throw new Error(error.message);
      if (data.session) {
        const profile = await sbProfile(data.user);
        return publicUser({ ...profile, email });
      }
      return publicUser({
        id: data.user.id, name, email, role, instrument: selectedInstrument,
        weekly_digest: true, class_reminders: true, text_notifications: false, phone_number: null,
      });
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
        const viewer = demoSessionUser(db);
        if (!viewer) return [];
        let rows = db.events;
        if (viewer.role === "student") {
          if (!viewer.instrument) return [];
          rows = rows.filter((event) => event.instrument === viewer.instrument);
        } else if (requestedInstrument) {
          rows = rows.filter((event) => event.instrument === requestedInstrument);
        }
        return rows.map((event) => {
          const active = activeStudentEnrollments(db, event.id);
          return {
            ...event,
            instrument_name: instrumentName(event.instrument, db),
            active_enrollments: active.length,
            spots_left: Math.max(0, event.student_capacity - active.length),
            is_enrolled: viewer.role === "student" && active.some((row) => row.student_id === viewer.id),
          };
        }).sort((left, right) => left.starts_at.localeCompare(right.starts_at));
      }

      const { data: authData } = await sb.auth.getSession();
      if (!authData.session) return [];
      const { data, error } = await sb.rpc("list_visible_events", {
        requested_instrument: requestedInstrument || null,
      });
      if (error) throw new Error(error.message);
      return data;
    },

    async createEvent(event) {
      if (DEMO) {
        const { db, currentUser } = requireDemoUser("admin");
        const row = { id: uid(), time_slot_id: uid(), ...event, created_by: currentUser.id };
        db.events.push(row);
        saveDb(db);
        return row;
      }
      const authUser = await requireSupabaseSession();
      const { data, error } = await sb.from("events").insert({ ...event, created_by: authUser.id }).select().single();
      if (error) throw new Error(error.message);
      return data;
    },

    async updateEvent(id, event) {
      if (DEMO) {
        const { db } = requireDemoUser("admin");
        const index = db.events.findIndex((candidate) => candidate.id === id);
        if (index < 0) throw new Error("Event not found.");
        const previous = db.events[index];
        const activeCount = activeStudentEnrollments(db, id).length;
        const scheduleChanged = previous.instrument !== event.instrument || previous.starts_at !== event.starts_at ||
          previous.ends_at !== event.ends_at || previous.event_type !== event.event_type;
        if (activeCount && scheduleChanged) {
          throw new Error("This class has active student enrollments. Students must leave or transfer before its instrument or time slot can change.");
        }
        if (activeCount > event.student_capacity) {
          throw new Error(`Student capacity cannot be lower than the active enrollment count (${activeCount}).`);
        }
        db.events[index] = { ...previous, ...event };
        saveDb(db);
        return db.events[index];
      }
      await requireSupabaseSession();
      const { data, error } = await sb.from("events").update(event).eq("id", id).select().single();
      if (error) throw new Error(error.message);
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

    async listClassEnrollments(eventId) {
      if (DEMO) {
        const { db } = requireDemoUser("admin");
        return activeStudentEnrollments(db, eventId).map((row) => ({
          ...row,
          student_name: db.users.find((user) => user.id === row.student_id)?.name || "Student",
        }));
      }
      await requireSupabaseSession();
      const { data, error } = await sb
        .from("student_enrollments")
        .select("id, student_id, instrument, time_slot_id, class_starts_at, class_ends_at, status, profiles!student_enrollments_student_id_fkey(full_name)")
        .eq("class_id", eventId)
        .eq("status", "active")
        .order("joined_at");
      if (error) throw new Error(error.message);
      return data.map((row) => ({ ...row, student_name: row.profiles?.full_name || "Student" }));
    },

    async joinClass(eventId) {
      if (DEMO) {
        const { db, currentUser } = requireDemoUser("student");
        const target = db.events.find((event) => event.id === eventId);
        if (!target || target.event_type !== "class") throw new Error("Class not found.");
        if (!currentUser.instrument) throw new Error("Choose an instrument in Settings before joining a class.");
        if (target.instrument !== currentUser.instrument) throw new Error("This class does not match your selected instrument.");
        if (!target.enrollment_open || new Date(target.starts_at).getTime() <= Date.now()) {
          throw new Error("This class is not open for enrollment.");
        }
        const existing = db.studentEnrollments.find((row) => row.student_id === currentUser.id && row.class_id === eventId);
        if (existing?.status === "active") throw new Error("You are already enrolled in this class.");
        const conflict = db.studentEnrollments.find((row) =>
          row.student_id === currentUser.id && row.status === "active" && row.class_id !== eventId &&
          overlaps(row.class_starts_at, row.class_ends_at, target.starts_at, target.ends_at)
        );
        if (conflict) throw new Error("This class conflicts with another class on your schedule.");
        const taken = activeStudentEnrollments(db, eventId).length;
        if (taken >= target.student_capacity) throw new Error("Class full.");

        if (existing) {
          Object.assign(existing, {
            instrument: target.instrument, time_slot_id: target.time_slot_id,
            class_starts_at: target.starts_at, class_ends_at: target.ends_at,
            status: "active", joined_at: new Date().toISOString(), left_at: null,
          });
        } else {
          db.studentEnrollments.push({
            id: uid(), student_id: currentUser.id, class_id: target.id,
            instrument: target.instrument, time_slot_id: target.time_slot_id,
            class_starts_at: target.starts_at, class_ends_at: target.ends_at,
            status: "active", joined_at: new Date().toISOString(), left_at: null,
          });
        }
        saveDb(db);
        return { class_id: eventId, spots_left: Math.max(0, target.student_capacity - taken - 1) };
      }
      const { data, error } = await sb.rpc("join_class", { target_class_id: eventId });
      if (error) throw new Error(error.message);
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
