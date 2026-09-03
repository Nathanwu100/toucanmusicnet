// Calendar: the public class and event schedule, plus enrollment,
// volunteer signup, and admin management for the accounts that have them.
//
// Reading the calendar needs no account. Everyone -- signed out included --
// sees every class and event, past and upcoming, and can filter by
// instrument or by time. Login only gates *acting*: joining a class,
// volunteering, and the admin editor.

(function () {
  const api = window.ToucanAPI;
  const $ = (selector) => document.querySelector(selector);

  let user = null;
  let events = [];
  let instruments = [];
  let current = new Date();
  let selectedDate = new Date();
  let editingId = null;
  let panelRenderId = 0;
  // "upcoming" | "past" | "all" -- applies to the grid and the day panel
  // alike, so what a day cell promises is what opening it delivers.
  let timeFilter = "all";
  // Set from ?event= on arrival, consumed by the first render, then cleared.
  // A reminder or a card on the home page links here naming its event.
  let pendingEventId = new URLSearchParams(window.location.search).get("event");
  // Set when a student asks to see past their own slot on a narrow screen.
  let showWholeTimetable = false;
  // The last thing the timetable was asked to draw, so a breakpoint change
  // can redraw it without the caller being involved.
  let lastTimetableCtx = null;

  const grid = $("#cal-grid");
  const title = $("#cal-title");
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const fmtRange = (event) => {
    const start = fmtTime(event.starts_at);
    return event.ends_at ? `${start} - ${fmtTime(event.ends_at)}` : start;
  };
  const sameDay = (left, right) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
  // An event counts as past once it has finished, not once it has started,
  // so a class you are sitting in is still "upcoming".
  const hasEnded = (event) => new Date(event.ends_at || event.starts_at).getTime() < Date.now();
  const inTimeFilter = (event) =>
    timeFilter === "all" || (timeFilter === "past" ? hasEnded(event) : !hasEnded(event));
  const visibleEvents = () => events.filter(inTimeFilter);
  const eventsForDate = (date) =>
    visibleEvents().filter((event) => sameDay(new Date(event.starts_at), date));
  const toLocalInput = (dateOrIso) => {
    const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Below the breakpoint the day panel sits under the month grid, far enough
  // down that tapping a day looks like it did nothing. Same query the
  // stylesheet uses, so the two cannot disagree about when that is true.
  const stackedLayout = () => window.matchMedia("(max-width: 1000px)").matches;

  function revealDayPanel() {
    if (!stackedLayout()) return;
    const panel = $("#day-panel");
    if (!panel) return;
    // After the panel has been redrawn, not before, or it scrolls to the
    // height the old contents happened to have.
    requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function selectDate(date, options = {}) {
    selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    current = new Date(date.getFullYear(), date.getMonth(), 1);
    render();
    if (options.reveal) revealDayPanel();
  }

  // The scope line says what is on screen. It is never a login wall: the
  // schedule is public, so the only thing signing in adds is the ability
  // to join a class.
  function renderScope() {
    const scope = $("#calendar-scope");
    const instrument = $("#instrument-filter").value;
    const instrumentLabel = instrument
      ? $("#instrument-filter").selectedOptions[0]?.textContent
      : "All instruments";
    const period = { upcoming: "Upcoming", past: "Past", all: "All" }[timeFilter];
    const shown = visibleEvents().length;

    scope.textContent = "";
    scope.append(element(
      "strong", "calendar-scope-summary",
      `${period} · ${instrumentLabel} · ${shown} item${shown === 1 ? "" : "s"}`
    ));

    let note = "";
    if (!user) note = "Anyone can browse the schedule. Sign in to join a class or volunteer.";
    else if (user.role === "student") {
      note = user.instrument_name
        ? `You can join ${user.instrument_name} classes.`
        : "Choose an instrument in Settings to join classes.";
    } else if (user.role === "volunteer") note = "You can sign up to volunteer for any event.";
    else if (user.role === "admin") note = "You can add, edit, and delete anything here.";

    const noteRow = element("span", "calendar-scope-note", note);
    if (!user) {
      noteRow.append(document.createTextNode(" "));
      const link = element("a", "", "Log in");
      link.href = "login.html";
      noteRow.append(link);
    }
    scope.append(noteRow);
  }

  // Switching to a period the current month has nothing in is a dead end,
  // so jump to the nearest month that does: the latest past month, or the
  // soonest upcoming one.
  function jumpToPeriod() {
    if (timeFilter === "all" || !events.length) return;
    const pool = events.filter(inTimeFilter);
    if (!pool.length || pool.some((event) => {
      const date = new Date(event.starts_at);
      return date.getFullYear() === current.getFullYear() && date.getMonth() === current.getMonth();
    })) return;
    const target = new Date((timeFilter === "past" ? pool[pool.length - 1] : pool[0]).starts_at);
    current = new Date(target.getFullYear(), target.getMonth(), 1);
    selectedDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  }

  function render() {
    const year = current.getFullYear();
    const month = current.getMonth();
    const today = new Date();
    title.textContent = `${MONTHS[month]} ${year}`;
    grid.innerHTML = "";

    const weekdays = element("div", "cal-weekdays");
    const daysGrid = element("div", "cal-days");
    DOWS.forEach((day) => weekdays.appendChild(element("div", "cal-dow", day)));
    grid.append(weekdays, daysGrid);

    const firstDow = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    for (let index = 0; index < firstDow; index += 1) {
      const pad = element("div", "cal-cell pad");
      pad.setAttribute("aria-hidden", "true");
      daysGrid.appendChild(pad);
    }

    for (let day = 1; day <= days; day += 1) {
      const date = new Date(year, month, day);
      const dayEvents = eventsForDate(date);
      const cell = element("button", "cal-cell");
      cell.type = "button";
      if (sameDay(date, today)) cell.classList.add("today");
      if (sameDay(date, selectedDate)) {
        cell.classList.add("selected");
        cell.setAttribute("aria-pressed", "true");
      } else {
        cell.setAttribute("aria-pressed", "false");
      }
      cell.setAttribute("aria-label", `${date.toLocaleDateString([], {
        month: "long", day: "numeric", year: "numeric",
      })}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`);
      cell.appendChild(element("span", "d", String(day)));

      if (dayEvents.length && dayEvents.every(hasEnded)) cell.classList.add("is-past");
      dayEvents.slice(0, 1).forEach((event) => {
        const chip = element(
          "span",
          `chip ${event.event_type === "class" ? "class" : "event"}` +
            `${event.is_enrolled ? " enrolled" : ""}${hasEnded(event) ? " is-past" : ""}`,
          `${fmtTime(event.starts_at)} ${event.title}`
        );
        cell.appendChild(chip);
      });
      if (dayEvents.length > 1) cell.appendChild(element("span", "chip-more", `+${dayEvents.length - 1} more`));
      cell.addEventListener("click", () => selectDate(date, { reveal: true }));
      daysGrid.appendChild(cell);
    }

    renderScope();
    renderPastLog();
    renderDayPanel();
  }

  // The archive below the grid. It always lists finished items regardless of
  // the Upcoming/Past/All control -- that toggle scopes the calendar, and a
  // drawer labelled "Past" that could be empty because of it would be a
  // riddle. The instrument filter does apply, because that one narrows what
  // the whole page is about.
  function renderPastLog() {
    const list = $("#past-log-list");
    const count = $("#past-log-count");
    if (!list) return;

    const past = events
      .filter(hasEnded)
      .sort((left, right) => right.starts_at.localeCompare(left.starts_at));

    count.textContent = past.length
      ? `${past.length} item${past.length === 1 ? "" : "s"}`
      : "nothing yet";
    list.innerHTML = "";

    if (!past.length) {
      list.appendChild(element("p", "past-log-empty",
        "Once a class or event finishes it is listed here."));
      return;
    }

    // Grouped by month, newest first, so an archive that grows over years
    // stays scannable instead of becoming one long undifferentiated run.
    let openMonth = null;
    let monthList = null;
    for (const event of past) {
      const date = new Date(event.starts_at);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (monthKey !== openMonth) {
        openMonth = monthKey;
        list.appendChild(element("h3", "past-log-month", `${MONTHS[date.getMonth()]} ${date.getFullYear()}`));
        monthList = element("ul", "past-log-items");
        list.appendChild(monthList);
      }

      const row = element("li", "past-log-item");
      const jump = element("button", "past-log-jump");
      jump.type = "button";
      jump.setAttribute("aria-label",
        `${event.title}, ${date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}. Show this day on the calendar.`);

      const when = element("span", "past-log-when");
      when.append(
        element("span", "past-log-day", String(date.getDate())),
        element("span", "past-log-dow", DOWS[date.getDay()])
      );

      const copy = element("span", "past-log-copy");
      copy.appendChild(element("strong", "", event.title));
      copy.appendChild(element("span", "past-log-meta",
        `${fmtRange(event)} · ${event.location || "Location not recorded"}`));

      const badges = element("span", "event-badges");
      badges.appendChild(element("span", `event-type ${event.event_type}`, event.event_type));
      event.instruments.forEach((slug, index) => {
        const badge = element("span", "instrument-badge", event.instrument_names?.[index] || slug);
        badge.dataset.instrument = slug;
        badges.appendChild(badge);
      });
      if (event.is_enrolled) badges.appendChild(element("span", "enrolled-badge", "Attended"));

      jump.append(when, copy, badges);
      // Opening the day in the calendar needs the period to admit past items,
      // or the click would scroll to a day that renders as empty.
      jump.addEventListener("click", () => {
        if (timeFilter === "upcoming") setTimeFilter("all");
        selectDate(date);
        $("#day-panel").scrollIntoView({ behavior: "smooth", block: "center" });
      });
      row.appendChild(jump);
      monthList.appendChild(row);
    }
  }

  async function refresh() {
    $("#calendar-scope").textContent = "Loading the schedule…";
    events = await api.listEvents($("#instrument-filter").value || null);
    // A linked event decides the day and the period; otherwise fall back to
    // keeping the current period stocked.
    const linked = pendingEventId && events.find((event) => event.id === pendingEventId);
    if (linked) {
      const date = new Date(linked.starts_at);
      if (!inTimeFilter(linked)) setTimeFilter("all");
      selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      current = new Date(date.getFullYear(), date.getMonth(), 1);
    } else {
      jumpToPeriod();
    }
    render();
  }

  function addMetaRow(parent, iconName, text) {
    if (!text) return;
    const row = element("p", "day-event-meta");
    const icon = document.createElement("iconify-icon");
    icon.setAttribute("icon", iconName);
    icon.setAttribute("aria-hidden", "true");
    row.append(icon, document.createTextNode(text));
    parent.appendChild(row);
  }

  // Every logged-in account sees the live student spot count; only students
  // get join/leave controls and only the admin sees the roster (capacity
  // itself is set in the admin editor).

  // ------------------------------------------------------------ block grid
  // A class with time blocks is shown as one column per instrument, its
  // sessions running down it in time order -- the same shape for everybody.
  // A student sees only their own column as bookable; an admin can drag any
  // block to a new time.

  // Settings is a drawer, not a page, so this opens it where the reader is.
  function settingsLink() {
    const link = element("button", "link-button", "Settings");
    link.type = "button";
    link.addEventListener("click", () => {
      document.querySelector("[data-open-settings]")?.click();
    });
    return link;
  }

  const blocksOf = (event) => (Array.isArray(event.blocks) ? event.blocks : []);

  // A saved block is identified by its database id. One that has only been
  // drawn has no id yet -- the server mints that on insert -- so it carries a
  // local _key instead, purely so the grid can tell the cards apart. _key is
  // stripped before anything is sent.
  // The columns the API accepts, without the counts the listing adds on the
  // way out or the local _key the grid uses to address an unsaved block.
  const forSaving = (block) => {
    const { taken, spots_left, is_mine, instrument_name, _key, ...keep } = block;
    return keep;
  };

  let draftKeySeed = 0;
  const nextDraftKey = () => `draft-${(draftKeySeed += 1)}`;
  const blockKey = (block) => block.id || block._key || "";

  // Snapping keeps dragged blocks on a tidy grid instead of landing on 3:07.
  const SNAP_MINUTES = 5;

  function instrumentColumns(event) {
    const blocks = blocksOf(event);
    const order = event.instruments || [];
    return order.map((slug, index) => ({
      slug,
      name: (event.instrument_names || [])[index] || slug,
      blocks: blocks
        .filter((block) => block.instrument === slug)
        .sort((left, right) => left.starts_at.localeCompare(right.starts_at)),
    }));
  }

  const minutesBetween = (from, to) => (new Date(to) - new Date(from)) / 60000;

  // Ticks every half hour, on the half hour, so the labels read like a real
  // calendar rather than starting at whatever minute the class happens to.
  function gridTicks(startsAt, endsAt) {
    const ticks = [];
    const cursor = new Date(startsAt);
    cursor.setSeconds(0, 0);
    if (cursor.getMinutes() % 30) {
      cursor.setMinutes(cursor.getMinutes() + (30 - (cursor.getMinutes() % 30)));
    }
    const end = new Date(endsAt);
    while (cursor <= end) {
      ticks.push(new Date(cursor));
      cursor.setMinutes(cursor.getMinutes() + 30);
    }
    return ticks;
  }

  // Blocks that overlap in the same column share the width rather than
  // sitting on top of each other, the way a calendar splits a busy hour.
  function assignLanes(blocks) {
    const running = [];
    return blocks.map((block) => {
      const start = new Date(block.starts_at).getTime();
      const end = new Date(block.ends_at).getTime();
      let lane = running.findIndex((freeAt) => freeAt <= start);
      if (lane === -1) { lane = running.length; running.push(end); }
      else running[lane] = end;
      return { block, lane };
    }).map((entry, _, all) => ({ ...entry, lanes: Math.max(...all.map((row) => row.lane)) + 1 }));
  }

  // A block reads like an event in a day calendar: filled in its instrument's
  // colour, with the name and time inside it. For a student it is the button
  // -- you click the slot you want, not a control tucked inside it.
  function blockCard(event, block, { isStudent, isAdmin, mine, joinable }) {
    const left = Number(block.spots_left) || 0;
    const full = left === 0 && !mine;
    // Students press the block itself; admins get a div they can drag.
    const interactive = isStudent && joinable && !full;
    const card = element(interactive ? "button" : "div", "tt-block");
    if (interactive) card.type = "button";
    card.dataset.blockId = blockKey(block);
    card.dataset.instrument = block.instrument;
    if (mine) card.classList.add("is-mine");
    if (full) card.classList.add("is-full");

    card.append(
      element("strong", "tt-block-name", block.label || "Session"),
      element("span", "tt-block-time", `${fmtTime(block.starts_at)} - ${fmtTime(block.ends_at)}`)
    );
    // The count sits to the right of the name, where it can be compared down
    // a column at a glance. Short on purpose: "2 left" reads at the width a
    // grid column actually has, where "2 of 3 places left" would wrap.
    const count = element(
      "span",
      `tt-block-spots${full ? " full" : ""}`,
      mine ? "Yours" : full ? "Full" : `${left} left`
    );
    // The long form is what a screen reader gets, and what shows on a tooltip.
    const spoken = mine
      ? "You are in this one"
      : full
        ? `Full, ${block.capacity} of ${block.capacity} taken`
        : `${left} of ${block.capacity} place${block.capacity === 1 ? "" : "s"} left`;
    count.title = spoken;
    count.setAttribute("aria-label", spoken);
    card.append(count);

    if (isAdmin) {
      card.draggable = true;
      card.classList.add("is-draggable");
      card.title = "Drag to move this block, or click to edit it";
      return card;
    }

    // A student pressing a slot in another instrument's column gets told why
    // it is not theirs, rather than a card that quietly does nothing.
    if (isStudent && !joinable && user?.instrument && block.instrument !== user.instrument) {
      card.classList.add("is-other-instrument");
      card.title = `For ${block.instrument_name || block.instrument} students`;
      card.addEventListener("click", () => {
        toast(
          `That slot is for ${block.instrument_name || block.instrument}. Your account is set to `
          + `${user.instrument_name}, and you can only take ${user.instrument_name} slots. `
          + `Change your instrument in Settings.`,
          "error"
        );
      });
    }

    if (isStudent && joinable) {
      card.classList.add("is-bookable");
      // A screen reader gets the whole sentence, not three loose fragments.
      card.setAttribute("aria-label", mine
        ? `Leave ${block.label} at ${fmtTime(block.starts_at)}`
        : full
          ? `${block.label} at ${fmtTime(block.starts_at)} is full`
          : `Take ${block.label} at ${fmtTime(block.starts_at)}, ${left} of ${block.capacity} places left`);
      if (full) {
        card.setAttribute("aria-disabled", "true");
        return card;
      }
      card.addEventListener("click", async () => {
        const when = `${fmtTime(block.starts_at)} to ${fmtTime(block.ends_at)}`;
        const day = new Date(block.starts_at)
          .toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
        if (mine) {
          if (!(await confirmDialog({
            title: "Leave this slot?",
            body: `You are booked into ${block.label} at ${fmtTime(block.starts_at)}. Leaving frees the place for somebody else.`,
            confirmLabel: "Leave the slot",
            cancelLabel: "Stay in it",
            tone: "danger",
          }))) return;
        } else if (!(await confirmDialog({
          title: `Take ${block.label}?`,
          body: `${day}, ${when}${event.location ? `, at ${event.location}` : ""}. `
            + `That is ${left === 1 ? "the last place" : `one of ${left} places`} in this slot.`,
          confirmLabel: "Take this slot",
          cancelLabel: "Not yet",
        }))) return;
        card.disabled = true;
        try {
          if (mine) {
            await api.leaveClass(event.id);
            toast(`You left the ${block.label} slot.`);
          } else {
            await api.joinClass(event.id, block.id);
            toast(`You are in ${block.label}, ${fmtTime(block.starts_at)}.`, "success");
          }
          await refresh();
        } catch (error) {
          toast(error.message, "error");
          card.disabled = false;
        }
      });
    }
    return card;
  }

  // Everything under the timetable that both the grid and the agenda need:
  // the way back to the other instruments, the note explaining whose column
  // is whose, and the admin controls. `table` is absent on the agenda, which
  // has nothing to drag.
  function appendTimetableFooter(host, options) {
    const { ctx, columns, shown, onlyMine, focusOwn, isStudent, isAdmin, table } = options;

    if ((focusOwn && columns.length > shown.length) || onlyMine) {
      const showAll = element("button", "btn btn-sm btn-quiet tt-show-all",
        onlyMine && columns.length === 1 ? "See every slot" : "See the other instruments");
      showAll.type = "button";
      showAll.addEventListener("click", () => {
        showWholeTimetable = true;
        renderBlockGrid(ctx);
      });
      host.appendChild(showAll);
    }

    // Say the rule where it applies, rather than leaving a student to work out
    // for themselves why two of the three columns ignore them.
    if (isStudent && !onlyMine) {
      const note = element("p", "block-note");
      const teachesMine = columns.some((column) => column.slug === user?.instrument);
      if (!user?.instrument) {
        note.append(document.createTextNode("Choose an instrument in "), settingsLink(),
          document.createTextNode(" before you can take a slot."));
      } else if (!teachesMine) {
        note.append(document.createTextNode(
          `This class does not teach ${user.instrument_name}, the instrument on your account. You can change that in `),
          settingsLink(), document.createTextNode("."));
      } else if (columns.length > 1) {
        note.append(document.createTextNode(focusOwn
          ? `Showing ${user.instrument_name} only, the instrument on your account. Change it in `
          : `You can only take slots in the ${user.instrument_name} column, because that is the instrument on your account. Change it in `),
          settingsLink(), document.createTextNode("."));
      }
      if (note.childNodes.length) host.appendChild(note);
    }

    if (isAdmin && table) {
      enableBlockDragging(table, ctx);
      enableBlockCreation(table, ctx);
      host.appendChild(element("p", "timetable-hint tt-hint-create",
        "Click an empty spot to add a block, or drag down to set how long it runs."));
    } else if (isAdmin) {
      // No grid to draw on, so a block is edited by pressing it and a new one
      // is added from the class dialog.
      host.querySelectorAll(".tt-block-row").forEach((card) => {
        card.style.cursor = "pointer";
        card.addEventListener("click", () => {
          const block = blocksOf(ctx.event).find((row) => blockKey(row) === card.dataset.blockId);
          if (block) {
            openBlockEditor({ ...ctx, block, instrument: block.instrument,
              startsAt: block.starts_at, endsAt: block.ends_at, column: card });
          }
        });
      });
      host.appendChild(element("p", "timetable-hint",
        "Press a slot to edit it. Adding slots is easier on a wider screen, or from Edit class."));
    }
  }

  // A time grid needs a time axis beside its columns, and on a phone that
  // does not fit -- it either scrolls sideways or squeezes the columns until
  // the times have to be hidden to make room. Neither is worth having, so
  // narrow screens get an agenda instead: the same slots as a list, in time
  // order, each carrying its own time. It only ever scrolls downwards.
  const AGENDA_QUERY = "(max-width: 700px)";

  // Rotating a phone, or dragging a desktop window narrow, crosses this line.
  // The two layouts are different DOM, not the same DOM restyled, so the
  // timetable has to be drawn again rather than left in the wrong shape.
  window.matchMedia(AGENDA_QUERY).addEventListener("change", () => {
    const host = $("#class-timetable");
    if (host && !host.hidden && lastTimetableCtx) renderBlockGrid(lastTimetableCtx);
  });

  function renderAgenda(host, columns, context) {
    const list = element("div", "tt-agenda");
    for (const column of columns) {
      if (!column.blocks.length) continue;
      if (columns.length > 1) {
        const heading = element("p", "tt-agenda-heading");
        const badge = element("span", "instrument-badge", column.name);
        badge.dataset.instrument = column.slug;
        heading.appendChild(badge);
        list.appendChild(heading);
      }
      for (const block of column.blocks) {
        const card = blockCard(context.event, block, {
          isStudent: context.isStudent,
          isAdmin: context.isAdmin,
          mine: block.id === context.enrolledBlockId,
          joinable: context.open && context.isStudent && column.slug === user?.instrument,
        });
        // No absolute positioning here: the row is laid out by the list, and
        // its time is written on it rather than read off an axis.
        card.classList.add("tt-block-row");
        list.appendChild(card);
      }
    }
    host.appendChild(list);
    return list;
  }

  // A slice of a day calendar: the class's start at the top, its end at the
  // bottom, half-hour rules across, and one column per instrument. Blocks are
  // placed by their real times, so a half-hour slot is half the height of an
  // hour one and a gap in the schedule looks like a gap.
  function renderBlockGrid(ctx) {
    const { event, host, isStudent, isAdmin, allowEmpty } = ctx;
    const columns = instrumentColumns(event);
    // The live timetable only appears once a class has blocks; the editor's
    // copy has to show its empty columns, because that is what you click on.
    if (!host || (!allowEmpty && !columns.some((column) => column.blocks.length))) return false;

    const startsAt = event.starts_at;
    const endsAt = event.ends_at || new Date(new Date(startsAt).getTime() + 3600000).toISOString();
    const total = Math.max(30, minutesBetween(startsAt, endsAt));

    closeBlockEditor();
    lastTimetableCtx = ctx;
    host.hidden = false;
    host.innerHTML = "";
    host.dataset.eventId = event.id;
    host.dataset.admin = String(Boolean(isAdmin));

    const head = element("div", "timetable-head");
    const copy = element("div", "");
    copy.append(
      element("p", "eyebrow", "Timetable"),
      element("h2", "", event.title),
      element("p", "timetable-when",
        `${new Date(startsAt).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · ${fmtRange(event)}` +
        (event.location ? ` · ${event.location}` : ""))
    );
    head.appendChild(copy);
    if (isAdmin) {
      head.appendChild(element("p", "timetable-hint", "Drag a block to move it, or into another column."));
    } else if (isStudent) {
      head.appendChild(element("p", "timetable-hint", "Pick a slot in your instrument's column."));
    }
    host.appendChild(head);

    const enrolledBlockId = blocksOf(event).find((block) => block.is_mine)?.id || null;
    const open = event.enrollment_open && !hasEnded(event);

    // A student can only book their own instrument, so by default that is the
    // only column they are shown -- the other two were three quarters of the
    // grid they could do nothing with. "See the other instruments" brings
    // them back for anyone who wants the whole picture.
    const ownColumn = isStudent && user?.instrument
      && columns.some((column) => column.slug === user.instrument);
    const focusOwn = ownColumn && !showWholeTimetable;

    // Narrower still: once they hold a place, a phone shows just that slot.
    const narrow = window.matchMedia("(max-width: 620px)").matches;
    const onlyMine = focusOwn && Boolean(enrolledBlockId) && narrow;

    let shown = columns;
    if (focusOwn) {
      shown = columns
        .filter((column) => column.slug === user.instrument)
        .map((column) => ({
          ...column,
          blocks: onlyMine
            ? column.blocks.filter((block) => block.id === enrolledBlockId)
            : column.blocks,
        }));
    }

    if (window.matchMedia(AGENDA_QUERY).matches) {
      renderAgenda(host, shown, { event, isStudent, isAdmin, enrolledBlockId, open });
      appendTimetableFooter(host, { ctx, columns, shown, onlyMine, focusOwn, isStudent, isAdmin });
      return true;
    }

    const table = element("div", "tt");
    table.style.setProperty("--tt-columns", String(shown.length));
    if (onlyMine) table.classList.add("is-focused");
    table.style.setProperty("--tt-minutes", String(total));

    // Column headings sit above the scrolling body so they stay readable.
    const scroller = element("div", "tt-scroll");
    const headings = element("div", "tt-headings");
    headings.appendChild(element("span", "tt-axis-head", ""));
    shown.forEach((column) => {
      const cell = element("span", "tt-heading", "");
      const badge = element("span", "instrument-badge", column.name);
      badge.dataset.instrument = column.slug;
      cell.appendChild(badge);
      headings.appendChild(cell);
    });
    scroller.appendChild(headings);

    const bodyRow = element("div", "tt-body");

    // The time axis: the class start, then every half hour, then the end.
    const axis = element("div", "tt-axis");
    const label = (when, extra) => {
      const tick = element("span", `tt-tick${extra ? " " + extra : ""}`, fmtTime(when));
      tick.style.top = `${(minutesBetween(startsAt, when) / total) * 100}%`;
      return tick;
    };
    axis.appendChild(label(startsAt, "tt-tick-edge"));
    gridTicks(startsAt, endsAt).forEach((tick) => {
      const at = tick.toISOString();
      if (minutesBetween(startsAt, at) > 5 && minutesBetween(at, endsAt) > 5) axis.appendChild(label(at));
    });
    axis.appendChild(label(endsAt, "tt-tick-edge"));
    bodyRow.appendChild(axis);


    for (const column of shown) {
      const lane = element("div", "tt-column");
      lane.dataset.instrument = column.slug;

      // The half-hour rules, drawn once per column so they line up with the axis.
      gridTicks(startsAt, endsAt).forEach((tick) => {
        const at = tick.toISOString();
        const offset = minutesBetween(startsAt, at);
        if (offset <= 0 || offset >= total) return;
        const rule = element("span", `tt-rule${tick.getMinutes() === 0 ? " tt-rule-hour" : ""}`);
        rule.style.top = `${(offset / total) * 100}%`;
        lane.appendChild(rule);
      });

      for (const { block, lane: index, lanes } of assignLanes(column.blocks)) {
        const card = blockCard(event, block, {
          isStudent,
          isAdmin,
          mine: block.id === enrolledBlockId,
          joinable: open && isStudent && column.slug === user?.instrument,
        });
        const offset = minutesBetween(startsAt, block.starts_at);
        const length = Math.max(10, minutesBetween(block.starts_at, block.ends_at));
        card.style.top = `${(offset / total) * 100}%`;
        // A few pixels off the height and width, so back-to-back slots read
        // as separate boxes rather than one long band of colour.
        card.style.height = `calc(${(length / total) * 100}% - 4px)`;
        card.style.left = `${(index / lanes) * 100}%`;
        card.style.width = `calc(${(1 / lanes) * 100}% - ${lanes > 1 ? 4 : 0}px)`;
        lane.appendChild(card);
      }
      bodyRow.appendChild(lane);
    }

    scroller.appendChild(bodyRow);
    table.appendChild(scroller);
    host.appendChild(table);

    appendTimetableFooter(host, { ctx, columns, shown, onlyMine, focusOwn, isStudent, isAdmin, table });
    return true;
  }

  // Dragging works the way it does in a day calendar: the block lands where
  // the pointer is, snapped to five minutes, and changes instrument if it is
  // dropped in another column. The server validates all of it again.
  function enableBlockDragging(table, ctx) {
    const { event, commit } = ctx;
    let dragging = null;
    let grabOffsetMinutes = 0;

    const startsAt = event.starts_at;
    const endsAt = event.ends_at || new Date(new Date(startsAt).getTime() + 3600000).toISOString();
    const total = Math.max(30, minutesBetween(startsAt, endsAt));

    const minutesAt = (column, clientY) => {
      const box = column.getBoundingClientRect();
      return ((clientY - box.top) / box.height) * total;
    };

    table.addEventListener("dragstart", (dragEvent) => {
      const card = dragEvent.target.closest(".tt-block");
      if (!card) return;
      dragging = card;
      // Keep the grab point under the cursor, so a block does not jump.
      const box = card.getBoundingClientRect();
      const columnBox = card.closest(".tt-column").getBoundingClientRect();
      grabOffsetMinutes = ((dragEvent.clientY - box.top) / columnBox.height) * total;
      card.classList.add("is-dragging");
      dragEvent.dataTransfer.effectAllowed = "move";
      dragEvent.dataTransfer.setData("text/plain", card.dataset.blockId);
    });

    table.addEventListener("dragend", () => {
      dragging?.classList.remove("is-dragging");
      table.querySelectorAll(".tt-column").forEach((column) => column.classList.remove("is-target"));
      dragging = null;
    });

    table.addEventListener("dragover", (dragEvent) => {
      if (!dragging) return;
      const column = dragEvent.target.closest(".tt-column");
      if (!column) return;
      dragEvent.preventDefault();
      dragEvent.dataTransfer.dropEffect = "move";
      table.querySelectorAll(".tt-column").forEach((other) => {
        other.classList.toggle("is-target", other === column);
      });
    });

    table.addEventListener("drop", async (dragEvent) => {
      if (!dragging) return;
      const column = dragEvent.target.closest(".tt-column");
      if (!column) return;
      dragEvent.preventDefault();

      const moved = blocksOf(event).find((block) => blockKey(block) === dragging.dataset.blockId);
      if (!moved) return;

      const length = minutesBetween(moved.starts_at, moved.ends_at);
      let offset = minutesAt(column, dragEvent.clientY) - grabOffsetMinutes;
      offset = Math.round(offset / SNAP_MINUTES) * SNAP_MINUTES;
      // A block can never be dragged outside the class that owns it.
      offset = Math.max(0, Math.min(offset, total - length));

      const classStart = new Date(startsAt).getTime();
      const nextStart = new Date(classStart + offset * 60000);
      const nextEnd = new Date(nextStart.getTime() + length * 60000);
      const instrument = column.dataset.instrument;

      if (moved.instrument === instrument &&
          new Date(moved.starts_at).getTime() === nextStart.getTime()) return;

      const next = blocksOf(event)
        .map((block) => (blockKey(block) === blockKey(moved)
          ? { ...block, instrument, starts_at: nextStart.toISOString(), ends_at: nextEnd.toISOString() }
          : block))
        .map(forSaving);

      try {
        await commit(next, `Moved "${moved.label}" to ${fmtTime(nextStart.toISOString())}.`);
      } catch (error) {
        toast(error.message, "error");
      }
    });
  }


  // ------------------------------------------------- click to add a block
  // Empty space in an admin's timetable behaves like empty space in a day
  // calendar: press, optionally drag to set the length, release, and a small
  // editor opens on the slot you drew. The times it opens with are the ones
  // you drew, and they stay editable, so "roughly here" and "exactly 3:35"
  // are both one gesture.

  const pad2 = (value) => String(value).padStart(2, "0");
  const toClock = (iso) => {
    const date = new Date(iso);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  };

  function closeBlockEditor() {
    document.querySelector(".tt-editor")?.remove();
    document.querySelector(".tt-ghost")?.remove();
  }

  // The popover. `block` is null when creating.
  function openBlockEditor(context) {
    const { event, host, commit, block, instrument, startsAt, endsAt, column } = context;
    closeBlockEditor();

    const form = document.createElement("form");
    form.className = "tt-editor";
    form.innerHTML = `
      <p class="tt-editor-title"></p>
      <label class="tt-editor-row"><span>Name</span><input type="text" name="label" required></label>
      <label class="tt-editor-row"><span>Instrument</span><select name="instrument"></select></label>
      <label class="tt-editor-row"><span>From</span><input type="time" name="start" required></label>
      <label class="tt-editor-row"><span>To</span><input type="time" name="end" required></label>
      <label class="tt-editor-row"><span>Places</span><input type="number" name="capacity" min="1" max="99" required></label>
      <p class="tt-editor-error" role="alert"></p>
      <div class="tt-editor-actions">
        <button class="btn btn-primary btn-sm" type="submit">Save</button>
        <button class="btn btn-quiet btn-sm" type="button" data-cancel>Cancel</button>
        <button class="btn btn-sm btn-danger" type="button" data-delete hidden>Delete</button>
      </div>`;

    form.querySelector(".tt-editor-title").textContent = block ? "Edit time block" : "New time block";
    const fields = form.elements;
    fields.label.value = block?.label || "Session";
    fields.start.value = toClock(startsAt);
    fields.end.value = toClock(endsAt);
    fields.capacity.value = block?.capacity || 4;

    (event.instruments || []).forEach((slug, index) => {
      const option = document.createElement("option");
      option.value = slug;
      option.textContent = (event.instrument_names || [])[index] || slug;
      fields.instrument.appendChild(option);
    });
    fields.instrument.value = block?.instrument || instrument;

    const remove = form.querySelector("[data-delete]");
    if (block) remove.hidden = false;

    // Anchored to the column it belongs to, and nudged back inside the
    // timetable if it would hang off the right edge.
    const hostBox = host.getBoundingClientRect();
    const columnBox = column.getBoundingClientRect();
    host.appendChild(form);
    const width = form.offsetWidth || 260;
    let left = columnBox.left - hostBox.left;
    left = Math.min(left, hostBox.width - width - 8);
    form.style.left = `${Math.max(8, left)}px`;
    form.style.top = `${columnBox.top - hostBox.top + 8}px`;
    fields.label.focus();
    fields.label.select();

    const fail = (message) => {
      form.querySelector(".tt-editor-error").textContent = message;
    };

    const dayOf = (iso) => new Date(iso).toISOString().slice(0, 10);
    const atClock = (clock) => {
      const base = new Date(event.starts_at);
      const [hours, minutes] = clock.split(":").map(Number);
      base.setHours(hours, minutes, 0, 0);
      return base.toISOString();
    };

    const save = async (blocks, message) => {
      try {
        await commit(blocks, message);
        closeBlockEditor();
      } catch (error) {
        fail(error.message);
      }
    };

    const stripped = () => blocksOf(event)
      .map(forSaving);

    form.addEventListener("submit", async (submitEvent) => {
      submitEvent.preventDefault();
      fail("");
      const next = {
        ...(block?.id ? { id: block.id } : {}),
        _key: block ? blockKey(block) : nextDraftKey(),
        label: fields.label.value.trim() || "Session",
        instrument: fields.instrument.value,
        starts_at: atClock(fields.start.value),
        ends_at: atClock(fields.end.value),
        capacity: parseInt(fields.capacity.value, 10) || 1,
      };
      if (new Date(next.ends_at) <= new Date(next.starts_at)) {
        fail("The end has to come after the start.");
        return;
      }
      const blocks = block
        ? stripped().map((row) => (blockKey(row) === blockKey(block) ? { ...row, ...next } : row))
        : [...stripped(), next];
      await save(blocks, block ? `Updated "${next.label}".` : `Added "${next.label}".`);
    });

    remove.addEventListener("click", async () => {
      await save(stripped().filter((row) => row.id !== block.id), `Removed "${block.label}".`);
    });

    form.querySelector("[data-cancel]").addEventListener("click", closeBlockEditor);
    form.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Escape") { keyEvent.stopPropagation(); closeBlockEditor(); }
    });
  }

  // Press-and-drag on empty column space to draw a new block.
  function enableBlockCreation(table, ctx) {
    const { event } = ctx;
    const startsAt = event.starts_at;
    const endsAt = event.ends_at || new Date(new Date(startsAt).getTime() + 3600000).toISOString();
    const total = Math.max(30, minutesBetween(startsAt, endsAt));
    const classStart = new Date(startsAt).getTime();

    const minutesAt = (column, clientY) => {
      const box = column.getBoundingClientRect();
      const raw = ((clientY - box.top) / box.height) * total;
      return Math.max(0, Math.min(total, Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES));
    };

    table.addEventListener("pointerdown", (pointerEvent) => {
      if (pointerEvent.button !== 0) return;
      const column = pointerEvent.target.closest(".tt-column");
      // Pressing on an existing block is a drag or an edit, not a new block.
      if (!column || pointerEvent.target.closest(".tt-block")) return;
      closeBlockEditor();

      const anchor = minutesAt(column, pointerEvent.clientY);
      const ghost = element("div", "tt-block tt-ghost");
      ghost.appendChild(element("strong", "tt-block-name", "New block"));
      column.appendChild(ghost);

      let from = anchor;
      let to = anchor + 30;
      const paint = () => {
        const top = Math.min(from, to);
        const height = Math.max(SNAP_MINUTES, Math.abs(to - from));
        ghost.style.top = `${(top / total) * 100}%`;
        ghost.style.height = `${(Math.min(height, total - top) / total) * 100}%`;
      };
      paint();

      const onMove = (moveEvent) => {
        to = minutesAt(column, moveEvent.clientY);
        if (to === from) to = from + SNAP_MINUTES;
        paint();
      };
      const onUp = () => {
        table.removeEventListener("pointermove", onMove);
        table.removeEventListener("pointerup", onUp);
        const top = Math.min(from, to);
        // A plain click, with no drag, means the usual half hour.
        const length = Math.max(SNAP_MINUTES, Math.abs(to - from) || 30);
        const clamped = Math.min(length, total - top);
        ghost.remove();
        openBlockEditor({
          ...ctx,
          block: null,
          instrument: column.dataset.instrument,
          startsAt: new Date(classStart + top * 60000).toISOString(),
          endsAt: new Date(classStart + (top + clamped) * 60000).toISOString(),
          column,
        });
      };
      table.addEventListener("pointermove", onMove);
      table.addEventListener("pointerup", onUp);
    });

    // Clicking an existing block opens it for editing. Dragging one moves it,
    // and a drag never ends in a click, so the two do not collide.
    table.addEventListener("click", (clickEvent) => {
      const card = clickEvent.target.closest(".tt-block");
      if (!card || card.classList.contains("tt-ghost")) return;
      const block = blocksOf(event).find((row) => blockKey(row) === card.dataset.blockId);
      if (!block) return;
      openBlockEditor({
        ...ctx,
        block,
        instrument: block.instrument,
        startsAt: block.starts_at,
        endsAt: block.ends_at,
        column: card.closest(".tt-column"),
      });
    });
  }

  // The timetable under the calendar, backed by the saved class. Every edit
  // goes straight to the server and the page reloads from what it says.
  function renderLiveTimetable(event, { isStudent, isAdmin }) {
    return renderBlockGrid({
      event,
      host: $("#class-timetable"),
      isStudent,
      isAdmin,
      commit: async (blocks, message) => {
        await api.updateEvent(event.id, { ...eventFields(event), blocks });
        toast(message, "success");
        await refresh();
      },
    });
  }

  // The columns updateEvent expects, without the computed extras the listing
  // adds on the way out.
  function eventFields(event) {
    return {
      title: event.title,
      event_type: event.event_type,
      instruments: event.instruments,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      location: event.location,
      volunteer_capacity: event.volunteer_capacity,
      student_capacity: event.student_capacity,
      enrollment_open: event.enrollment_open,
      description: event.description,
    };
  }


  // Everything an admin needs to reach a student, and which slot they took.
  // Contact details only ever come from list_class_roster, which refuses
  // anyone who is not an admin.
  function rosterTable(roster, event) {
    const wrap = element("div", "roster");
    const total = event.student_capacity || roster.length;
    wrap.appendChild(element("p", "roster-head",
      roster.length ? `Enrolled students (${roster.length}${total ? ` of ${total}` : ""})`
                    : "No students enrolled yet"));
    if (!roster.length) return wrap;

    const table = element("table", "roster-table");
    const head = element("tr", "");
    ["Student", "Instrument", "Slot", "Email", "Phone", ""].forEach((label) => {
      head.appendChild(element("th", "", label));
    });
    table.appendChild(element("thead", "")).appendChild(head);
    const tbody = element("tbody", "");

    for (const entry of roster) {
      const row = element("tr", "");
      row.appendChild(element("td", "roster-name", entry.student_name || "Student"));

      const instrumentCell = element("td", "");
      const badge = element("span", "instrument-badge", entry.instrument_name || entry.instrument || "-");
      if (entry.instrument) badge.dataset.instrument = entry.instrument;
      instrumentCell.appendChild(badge);
      row.appendChild(instrumentCell);

      row.appendChild(element("td", "roster-slot", entry.block_label
        ? `${entry.block_label} · ${fmtTime(entry.block_starts_at)}`
        : "Whole class"));

      const emailCell = element("td", "");
      if (entry.email) {
        const link = element("a", "", entry.email);
        link.href = `mailto:${entry.email}`;
        emailCell.appendChild(link);
      } else {
        emailCell.textContent = "-";
      }
      row.appendChild(emailCell);

      const phoneCell = element("td", "");
      if (entry.phone_number) {
        const link = element("a", "", entry.phone_number);
        link.href = `tel:${entry.phone_number}`;
        phoneCell.appendChild(link);
      } else {
        phoneCell.textContent = "-";
      }
      row.appendChild(phoneCell);

      // Moving somebody keeps their place; removing takes it away. Either way
      // the student is told the next time they open the site.
      const actions = element("td", "roster-actions");
      const move = element("button", "btn btn-sm btn-quiet", "Move");
      move.type = "button";
      move.addEventListener("click", () => openMoveDialog(entry, event));
      const drop = element("button", "btn btn-sm btn-danger", "Remove");
      drop.type = "button";
      drop.addEventListener("click", async () => {
        if (!(await confirmDialog({
          title: `Remove ${entry.student_name}?`,
          body: "Their place is cancelled. They will be told the next time they open the site, and asked to pick another time.",
          confirmLabel: "Remove them",
          tone: "danger",
        }))) return;
        drop.disabled = true;
        try {
          await api.removeEnrollment(entry.enrollment_id, "An admin removed you from this class.");
          toast(`${entry.student_name} was removed. They will see a note about it.`, "success");
          await refresh();
        } catch (error) {
          toast(error.message, "error");
          drop.disabled = false;
        }
      });
      actions.append(move, drop);
      row.appendChild(actions);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // Where to put somebody instead. Only the classes and slots they could have
  // booked themselves are offered, so a move cannot create a booking a
  // student would have been refused.
  function openMoveDialog(entry, currentEvent) {
    const eligible = events.filter((candidate) =>
      candidate.event_type === "class" &&
      (candidate.instruments || []).includes(entry.instrument) &&
      !hasEnded(candidate));
    if (!eligible.length) {
      toast(`No other class teaches ${entry.instrument_name || entry.instrument}.`, "error");
      return;
    }

    const backdrop = element("div", "modal-backdrop open");
    const panel = element("div", "modal move-modal");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.innerHTML = `
      <h2>Move ${escapeHtml(entry.student_name)}</h2>
      <p class="meta">Currently in ${escapeHtml(entry.block_label || currentEvent.title)}.</p>
      <div class="form-error" role="alert"></div>
      <div class="field"><label>Class</label><select data-class></select></div>
      <div class="field" data-block-field hidden><label>Time block</label><select data-block></select></div>
      <div class="modal-actions">
        <button class="btn btn-quiet" type="button" data-cancel>Cancel</button>
        <button class="btn btn-primary" type="button" data-confirm>Move them</button>
      </div>`;
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    const classSelect = panel.querySelector("[data-class]");
    const blockSelect = panel.querySelector("[data-block]");
    const blockField = panel.querySelector("[data-block-field]");
    const errorBox = panel.querySelector(".form-error");

    eligible.forEach((candidate) => {
      const option = document.createElement("option");
      option.value = candidate.id;
      const when = new Date(candidate.starts_at)
        .toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
      option.textContent = `${candidate.title} · ${when}`;
      classSelect.appendChild(option);
    });
    classSelect.value = currentEvent.id;

    const syncBlocks = () => {
      const target = eligible.find((candidate) => candidate.id === classSelect.value);
      // Only this student's own instrument column, and only slots with room.
      const options = blocksOf(target)
        .filter((block) => block.instrument === entry.instrument)
        .filter((block) => block.spots_left > 0 || block.id === entry.block_id);
      blockField.hidden = !blocksOf(target).length;
      blockSelect.innerHTML = "";
      options.forEach((block) => {
        const option = document.createElement("option");
        option.value = block.id;
        option.textContent = `${block.label} · ${fmtTime(block.starts_at)}` +
          (block.id === entry.block_id ? " (current)" : ` · ${block.spots_left} left`);
        blockSelect.appendChild(option);
      });
      if (!options.length && blocksOf(target).length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No slot with room in their instrument";
        blockSelect.appendChild(option);
      }
    };
    classSelect.addEventListener("change", syncBlocks);
    syncBlocks();

    const close = () => backdrop.remove();
    panel.querySelector("[data-cancel]").addEventListener("click", close);
    backdrop.addEventListener("click", (clickEvent) => {
      if (clickEvent.target === backdrop) close();
    });

    panel.querySelector("[data-confirm]").addEventListener("click", async () => {
      errorBox.classList.remove("show");
      const blockId = blockField.hidden ? null : blockSelect.value || null;
      if (!blockField.hidden && !blockId) {
        errorBox.textContent = "There is no slot with room for them in that class.";
        errorBox.classList.add("show");
        return;
      }
      try {
        await api.moveEnrollment(entry.enrollment_id, classSelect.value, blockId,
          "An admin moved you to a different time.");
        close();
        toast(`${entry.student_name} was moved. They will see a note about it.`, "success");
        await refresh();
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.classList.add("show");
      }
    });
  }

  async function appendRoster(body, event, isAdmin, renderId) {
    if (!isAdmin) return;
    try {
      const roster = await api.listClassEnrollments(event.id);
      if (renderId !== panelRenderId) return;
      body.appendChild(rosterTable(roster, event));
    } catch (error) {
      body.appendChild(element("p", "day-panel-error", error.message));
    }
  }

  async function addStudentEnrollmentControls(body, event, isStudent, isAdmin, renderId) {
    if (event.event_type !== "class") return;

    // A class split into blocks is booked one block at a time, so the grid
    // replaces the single whole-class spot counter entirely. It is drawn in
    // the full-width section under the calendar, where the columns fit.
    const blocks = blocksOf(event);
    if (blocks.length) {
      const open = blocks.reduce((total, block) => total + (Number(block.spots_left) || 0), 0);
      const summary = element("div", "day-enrollment-row");
      summary.appendChild(element("span", "spots",
        `${blocks.length} slot${blocks.length === 1 ? "" : "s"}, ${open} place${open === 1 ? "" : "s"} open`));
      const show = element("button", "btn btn-sm btn-quiet", "See the timetable");
      show.type = "button";
      show.addEventListener("click", () => {
        renderLiveTimetable(event, { isStudent, isAdmin });
        $("#class-timetable").scrollIntoView({ behavior: "smooth", block: "center" });
      });
      summary.appendChild(show);
      body.appendChild(summary);
      if (!user) {
        const prompt = element("a", "btn btn-sm", "Sign in to take a slot");
        prompt.href = "login.html";
        body.appendChild(prompt);
      }
      // Opening the class shows its timetable straight away.
      renderLiveTimetable(event, { isStudent, isAdmin });
      // The roster goes under the timetable rather than in the day panel:
      // email and phone columns need the width, and beside it they were
      // pushed off into a horizontal scroll nobody would find.
      await appendRoster($("#class-timetable"), event, isAdmin, renderId);
      return;
    }
    const left = Math.max(0, Number(event.spots_left) || 0);
    const capacity = Math.max(0, Number(event.student_capacity) || 0);
    const past = hasEnded(event);
    const capacityRow = element("div", "day-enrollment-row");
    const spotText = past
      ? `${capacity - left}/${capacity} student spot${capacity === 1 ? "" : "s"} taken`
      : left === 0
        ? `Class full (0/${capacity} student spots)`
        : `${left}/${capacity} student spot${capacity === 1 ? "" : "s"} left`;
    const spots = element("span", `spots${!past && left === 0 ? " full" : ""}`, spotText);
    capacityRow.appendChild(spots);

    // A finished class is a record, not an offer: it keeps its numbers but
    // loses every control that would imply you can still get into it.
    if (past) {
      body.appendChild(capacityRow);
      return;
    }

    // A signed-out visitor still sees how full a class is; the sign-in
    // prompt stands in for the join button they cannot have yet.
    if (!user) {
      const prompt = element("a", "btn btn-sm", "Sign in to join");
      prompt.href = "login.html";
      capacityRow.appendChild(prompt);
      body.appendChild(capacityRow);
      return;
    }

    if (isStudent) {
      const enrolled = event.is_enrolled === true;
      // Students now browse every instrument, but can still only join a class
      // that teaches their own -- join_class enforces this server-side, so
      // the button says so rather than letting the click fail.
      const wrongInstrument = Boolean(user.instrument) && !event.instruments.includes(user.instrument);
      const action = element(
        "button",
        `btn btn-sm ${enrolled ? "btn-quiet" : "btn-primary"}`,
        enrolled ? "Leave class" : "Join class"
      );
      const started = new Date(event.starts_at).getTime() <= Date.now();
      action.disabled = !enrolled &&
        (left === 0 || !event.enrollment_open || started || wrongInstrument || !user.instrument);
      if (!enrolled && !user.instrument) action.title = "Choose an instrument in Settings first.";
      if (!enrolled && wrongInstrument) {
        action.title = `You are enrolled in ${user.instrument_name}, so you cannot join a ${(event.instrument_names || event.instruments).join(" / ")} class.`;
      }
      if (!enrolled && !event.enrollment_open) action.title = "Enrollment is closed.";
      if (!enrolled && started) action.title = "This class has already started.";
      action.addEventListener("click", async () => {
        action.disabled = true;
        try {
          if (enrolled) {
            await api.leaveClass(event.id);
            toast(`You left “${event.title}”. The spot is available again.`);
          } else {
            await api.joinClass(event.id);
            toast(`You joined “${event.title}” at ${fmtRange(event)}.`, "success");
          }
          await refresh();
        } catch (error) {
          toast(error.message, "error");
          action.disabled = false;
        }
      });
      capacityRow.appendChild(action);
      if (enrolled) {
        body.appendChild(element("p", "enrollment-linked", `Enrolled · ${user.instrument_name} · time slot ${fmtRange(event)}`));
      }
    }
    body.appendChild(capacityRow);

    await appendRoster(body, event, isAdmin, renderId);
  }

  async function renderDayPanel() {
    const renderId = ++panelRenderId;
    const timetable = $("#class-timetable");
    if (timetable) {
      timetable.hidden = true;
      timetable.innerHTML = "";
    }
    showWholeTimetable = false;
    const dayEvents = eventsForDate(selectedDate);
    $("#selected-day-title").textContent = selectedDate.toLocaleDateString([], {
      weekday: "long", month: "long", day: "numeric",
    });
    $("#selected-day-summary").textContent = dayEvents.length
      ? `${dayEvents.length} scheduled event${dayEvents.length === 1 ? "" : "s"}`
      : "Nothing scheduled";

    // Each item waits on enrollment and volunteer counts before it can be
    // appended, so stand placeholders in until the first real one is ready.
    const list = $("#day-event-list");
    list.innerHTML = dayEvents.length
      ? Array.from({ length: Math.min(dayEvents.length, 3) }, () => `
        <div class="day-event-skeleton" aria-hidden="true">
          <div class="skeleton skeleton-line short"></div>
          <div class="skeleton skeleton-line"></div>
        </div>`).join("")
      : "";
    let listCleared = !dayEvents.length;
    const clearSkeletons = () => {
      if (listCleared) return;
      list.innerHTML = "";
      listCleared = true;
    };

    if (!dayEvents.length) {
      const empty = element("div", "day-empty");
      const icon = document.createElement("iconify-icon");
      icon.setAttribute("icon", "pixelarticons:calendar");
      icon.setAttribute("aria-hidden", "true");
      let message = "Select another day to see scheduled items.";
      if (timeFilter === "upcoming") message = "Nothing upcoming on this day. Switch to Past or All to look back.";
      else if (timeFilter === "past") message = "Nothing finished on this day. Switch to Upcoming or All.";
      else if (user?.role === "admin") message = "Select another day, change a filter, or add an event here.";
      empty.append(icon, element("p", "", message));
      list.appendChild(empty);
      return;
    }

    for (const event of dayEvents) {
      const past = hasEnded(event);
      const item = element(
        "details",
        `day-event-item${event.is_enrolled ? " is-enrolled" : ""}${past ? " is-past" : ""}`
      );
      const summary = element("summary", "day-event-summary");
      const summaryInner = element("span", "day-event-summary-inner");
      const summaryCopy = element("span", "day-event-summary-copy");
      const badges = element("span", "event-badges");
      badges.appendChild(element("span", `event-type ${event.event_type}`, event.event_type));
      event.instruments.forEach((slug, index) => {
        const instrumentBadge = element("span", "instrument-badge", event.instrument_names?.[index] || slug);
        instrumentBadge.dataset.instrument = slug;
        badges.appendChild(instrumentBadge);
      });
      if (event.is_enrolled) badges.appendChild(element("span", "enrolled-badge", "Enrolled"));
      if (past) badges.appendChild(element("span", "past-badge", "Ended"));
      summaryCopy.append(element("strong", "", event.title), element("span", "day-event-summary-time", fmtRange(event)));
      summaryInner.append(badges, summaryCopy);
      summary.appendChild(summaryInner);
      const body = element("div", "day-event-body");
      item.append(summary, body);
      addMetaRow(body, "pixelarticons:music", (event.instrument_names || event.instruments).join(", "));
      addMetaRow(body, "pixelarticons:clock", fmtRange(event));
      addMetaRow(body, "pixelarticons:map", event.location || "Location to be announced");
      if (event.description) body.appendChild(element("p", "day-event-description", event.description));

      const isAdmin = user?.role === "admin";
      const isVolunteer = user?.role === "volunteer";
      const isStudent = user?.role === "student";
      await addStudentEnrollmentControls(body, event, isStudent, isAdmin, renderId);
      if (renderId !== panelRenderId) return;
      clearSkeletons();

      if ((isAdmin || isVolunteer) && event.volunteer_capacity > 0 && !past) {
        try {
          const { count, mine } = await api.signupStatus(event.id, user);
          if (renderId !== panelRenderId) return;
          const left = Math.max(0, event.volunteer_capacity - count);
          const volunteerRow = element("div", "day-volunteer-row");
          volunteerRow.appendChild(element(
            "span", `spots${left === 0 ? " full" : ""}`,
            `${left}/${event.volunteer_capacity} volunteer spot${event.volunteer_capacity === 1 ? "" : "s"} left`
          ));
          if (isVolunteer) {
            const action = element("button", `btn btn-sm ${mine ? "btn-quiet" : "btn-primary"}`, mine ? "Withdraw" : "Volunteer");
            action.disabled = !mine && left === 0;
            action.addEventListener("click", async () => {
              action.disabled = true;
              try {
                if (mine) {
                  await api.volunteerCancel(event.id, user);
                  toast(`You withdrew from “${event.title}”.`);
                } else {
                  await api.volunteerSignup(event.id, user);
                  toast(`You are volunteering for “${event.title}”.`, "success");
                }
                renderDayPanel();
              } catch (error) {
                toast(error.message, "error");
                action.disabled = false;
              }
            });
            volunteerRow.appendChild(action);
          }
          body.appendChild(volunteerRow);
          if (isAdmin) {
            const names = await api.listSignups(event.id);
            if (renderId !== panelRenderId) return;
            body.appendChild(element("p", "day-roster", names.length
              ? `Volunteers: ${names.map((entry) => entry.user_name).join(", ")}`
              : "Volunteers: no one yet"));
          }
        } catch (error) {
          body.appendChild(element("p", "day-panel-error", error.message));
        }
      } else if (isVolunteer && !past) {
        body.appendChild(element("p", "day-roster", "No volunteer spots for this event."));
      }

      if (isAdmin) {
        const actions = element("div", "day-event-actions");
        const edit = element("button", "btn btn-sm btn-quiet", "Edit");
        const remove = element("button", "btn btn-sm btn-danger", "Delete");
        edit.addEventListener("click", () => openEditor(event));
        remove.addEventListener("click", async () => {
          const active = Number(event.active_enrollments) || 0;
          if (active) {
            toast(`This class has ${active} active student enrollment${active === 1 ? "" : "s"}. Students must leave or transfer before deletion.`, "error");
            return;
          }
          if (!(await confirmDialog({
            title: `Delete “${event.title}”?`,
            body: "The class and every volunteer signup on it are removed. This cannot be undone.",
            confirmLabel: "Delete it",
            tone: "danger",
          }))) return;
          remove.disabled = true;
          try {
            await api.deleteEvent(event.id);
            toast("Event deleted.");
            await refresh();
          } catch (error) {
            toast(error.message, "error");
            remove.disabled = false;
          }
        });
        actions.append(edit, remove);
        body.appendChild(actions);
      }
      clearSkeletons();
      if (pendingEventId && event.id === pendingEventId) {
        item.open = true;
        item.classList.add("is-linked");
        requestAnimationFrame(() => item.scrollIntoView({ behavior: "smooth", block: "center" }));
      }
      list.appendChild(item);
    }
    // One arrival, one highlight: clear it so later renders behave normally.
    pendingEventId = null;
  }


  // ------------------------------------------------------- block editor
  // The dialog shows the same timetable the calendar does, so laying a class
  // out and looking at it later are the same picture and the same gestures.
  // The difference is only where edits go: here they collect in a draft that
  // is written when the class itself is saved.
  let draftBlocks = [];

  // Built from whatever the form currently says, so the grid follows the
  // instruments ticked and the start and end typed above it.
  function draftClass() {
    const start = $("#f-start").value;
    const end = $("#f-end").value;
    const chosen = [...document.querySelectorAll("#f-instruments input:checked")];
    return {
      id: editingId,
      event_type: $("#f-type").value,
      starts_at: start ? new Date(start).toISOString() : null,
      ends_at: end ? new Date(end).toISOString() : null,
      instruments: chosen.map((input) => input.value),
      instrument_names: chosen.map((input) => input.closest("label").textContent.trim()),
      blocks: draftBlocks,
    };
  }

  function renderDraftTimetable() {
    const host = $("#f-blocks");
    if (!host) return;
    const model = draftClass();
    host.innerHTML = "";

    // Without a window and at least one instrument there are no columns to
    // draw, so say what is missing rather than showing an empty frame.
    if (!model.starts_at || !model.ends_at || new Date(model.ends_at) <= new Date(model.starts_at)) {
      host.appendChild(element("p", "block-editor-empty", "Set the class start and end times first."));
      return;
    }
    if (!model.instruments.length) {
      host.appendChild(element("p", "block-editor-empty", "Tick at least one instrument first."));
      return;
    }

    renderBlockGrid({
      event: model,
      host,
      isStudent: false,
      isAdmin: true,
      allowEmpty: true,
      commit: (blocks) => {
        // Nothing is saved until the class is. Drop the computed extras the
        // live listing adds so the draft stays the shape the API wants.
        draftBlocks = blocks.map((block) => ({
          ...forSaving(block),
          _key: blockKey(block) || nextDraftKey(),
        }));
        renderDraftTimetable();
      },
    });
  }

  // Lay a whole class out in one go: back-to-back slots of the chosen length,
  // in every instrument column, from the class's start to its end. This is
  // what most Saturdays look like, so it should not take twenty clicks.
  //
  // Existing blocks are left alone and generated slots that would land on top
  // of one are skipped, so pressing this on a half-built class fills the gaps
  // instead of throwing away the work.
  function fillDefaultBlocks() {
    const model = draftClass();
    const note = $("#fill-note");
    note.textContent = "";

    if (!model.starts_at || !model.ends_at || new Date(model.ends_at) <= new Date(model.starts_at)) {
      note.textContent = "Set the class start and end times first.";
      return;
    }
    if (!model.instruments.length) {
      note.textContent = "Tick at least one instrument first.";
      return;
    }

    const length = Math.max(5, parseInt($("#fill-length").value, 10) || 30);
    const capacity = Math.max(1, parseInt($("#fill-capacity").value, 10) || 4);
    const classStart = new Date(model.starts_at).getTime();
    const classEnd = new Date(model.ends_at).getTime();
    const overlaps = (instrument, from, to) => draftBlocks.some((block) =>
      block.instrument === instrument &&
      new Date(block.starts_at).getTime() < to &&
      new Date(block.ends_at).getTime() > from);

    const added = [];
    for (const instrument of model.instruments) {
      let cursor = classStart;
      let index = 1;
      while (cursor < classEnd) {
        // The last slot is short rather than overrunning the class.
        const finish = Math.min(cursor + length * 60000, classEnd);
        // A sliver left at the end is not worth a slot of its own.
        if (finish - cursor < 5 * 60000) break;
        if (!overlaps(instrument, cursor, finish)) {
          added.push({
            id: undefined,
            instrument,
            label: `Session ${index}`,
            starts_at: new Date(cursor).toISOString(),
            ends_at: new Date(finish).toISOString(),
            capacity,
          });
        }
        cursor = finish;
        index += 1;
      }
    }

    if (!added.length) {
      note.textContent = "Every column is already full for that length.";
      return;
    }
    draftBlocks = [...draftBlocks, ...added];
    renderDraftTimetable();
    const columns = model.instruments.length;
    note.textContent = `Added ${added.length} slot${added.length === 1 ? "" : "s"} across ${columns} column${columns === 1 ? "" : "s"}.`;
  }

  // Blocks are handed to createEvent and updateEvent exactly as drafted.
  function collectBlocks() {
    return draftBlocks.map(forSaving);
  }

  function syncClassFields() {
    const isClass = $("#f-type").value === "class";
    $("#class-enrollment-fields").hidden = !isClass;
    $("#f-student-capacity").required = isClass;
  }

  function openEditor(event, defaultType = "class") {
    editingId = event ? event.id : null;
    const type = event?.event_type || defaultType;
    const kind = type === "class" ? "class" : "event";
    const defaultStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 16, 0);
    const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);
    $("#e-title").textContent = event
      ? `Edit ${kind}`
      : `New ${kind} for ${selectedDate.toLocaleDateString([], { month: "long", day: "numeric" })}`;
    $("#e-error").classList.remove("show");
    $("#f-title").value = event?.title || "";
    $("#f-type").value = type;
    // A new item starts with the first catalog instrument checked -- the same
    // default the old single-instrument dropdown had.
    const selected = event ? event.instruments : [instruments[0]?.slug].filter(Boolean);
    document.querySelectorAll("#f-instruments input").forEach((input) => {
      input.checked = selected.includes(input.value);
    });
    $("#f-start").value = event ? toLocalInput(event.starts_at) : toLocalInput(defaultStart);
    $("#f-end").value = event?.ends_at ? toLocalInput(event.ends_at) : toLocalInput(defaultEnd);
    $("#f-location").value = event?.location || "";
    $("#f-capacity").value = event?.volunteer_capacity ?? 2;
    $("#f-student-capacity").value = event?.student_capacity || 12;
    $("#f-enrollment-open").checked = event ? event.enrollment_open : true;
    $("#f-description").value = event?.description || "";
    $("#fill-note").textContent = "";
    // Saved blocks arrive with an id; that is their key. Only ones drawn in
    // this dialog need a local one.
    draftBlocks = (event?.blocks || []).map(forSaving);
    renderDraftTimetable();
    syncClassFields();
    $("#edit-backdrop").classList.add("open");
    $("#f-title").focus();
  }

  $("#event-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = $("#e-error");
    errorBox.classList.remove("show");
    const start = $("#f-start").value;
    const end = $("#f-end").value;
    const eventType = $("#f-type").value;
    const studentCapacity = eventType === "class" ? Math.max(1, parseInt($("#f-student-capacity").value, 10) || 0) : 0;
    const selectedInstruments = [...document.querySelectorAll("#f-instruments input:checked")]
      .map((input) => input.value);
    if (!$("#f-title").value.trim() || !selectedInstruments.length || !start || !end) {
      errorBox.textContent = "Title, at least one instrument, start, and end are required.";
      errorBox.classList.add("show");
      return;
    }
    if (new Date(end) <= new Date(start)) {
      errorBox.textContent = "The end time must be after the start time.";
      errorBox.classList.add("show");
      return;
    }

    const data = {
      title: $("#f-title").value.trim(),
      event_type: eventType,
      instruments: selectedInstruments,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
      location: $("#f-location").value.trim(),
      volunteer_capacity: Math.max(0, parseInt($("#f-capacity").value, 10) || 0),
      student_capacity: studentCapacity,
      enrollment_open: eventType === "class" && $("#f-enrollment-open").checked,
      description: $("#f-description").value.trim(),
      blocks: eventType === "class" ? collectBlocks() : [],
    };

    if (editingId) {
      const previous = events.find((candidate) => candidate.id === editingId);
      const active = Number(previous?.active_enrollments) || 0;
      // Instruments are not part of this precheck: adding one is always
      // allowed, and removing one is only blocked when an active enrollment
      // uses it -- which the server checks, since the roster isn't here.
      const scheduleChanged = previous && (
        previous.starts_at !== data.starts_at ||
        previous.ends_at !== data.ends_at || previous.event_type !== data.event_type
      );
      if (active && scheduleChanged) {
        errorBox.textContent = `This class has ${active} active student enrollment${active === 1 ? "" : "s"}. Students must leave or transfer before its time slot can change.`;
        errorBox.classList.add("show");
        return;
      }
      if (active > data.student_capacity) {
        errorBox.textContent = `Student capacity cannot be lower than the ${active} active enrollments.`;
        errorBox.classList.add("show");
        return;
      }
    }

    try {
      if (editingId) {
        await api.updateEvent(editingId, data);
        toast("Event updated.");
      } else {
        await api.createEvent(data);
        toast("Event added to the calendar.", "success");
      }
      const savedDate = new Date(data.starts_at);
      selectedDate = new Date(savedDate.getFullYear(), savedDate.getMonth(), savedDate.getDate());
      current = new Date(savedDate.getFullYear(), savedDate.getMonth(), 1);
      closeModals();
      await refresh();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.add("show");
    }
  });

  function closeModals() {
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => backdrop.classList.remove("open"));
  }

  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", closeModals));
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeModals();
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModals();
  });

  $("#prev").addEventListener("click", () => selectDate(new Date(current.getFullYear(), current.getMonth() - 1, 1)));
  $("#next").addEventListener("click", () => selectDate(new Date(current.getFullYear(), current.getMonth() + 1, 1)));
  $("#new-class").addEventListener("click", () => openEditor(null, "class"));
  $("#new-event").addEventListener("click", () => openEditor(null, "event"));
  $("#day-new-class").addEventListener("click", () => openEditor(null, "class"));
  $("#day-new-event").addEventListener("click", () => openEditor(null, "event"));
  $("#f-type").addEventListener("change", () => {
    syncClassFields();
    renderDraftTimetable();
  });
  // The grid is drawn from the window and instruments above it, so it has to
  // follow them as they change.
  $("#f-instruments").addEventListener("change", () => {
    // An instrument that stops being taught cannot keep its column.
    const taught = new Set([...document.querySelectorAll("#f-instruments input:checked")].map((i) => i.value));
    draftBlocks = draftBlocks.filter((block) => taught.has(block.instrument));
    renderDraftTimetable();
  });
  $("#f-start").addEventListener("change", renderDraftTimetable);
  $("#f-end").addEventListener("change", renderDraftTimetable);
  $("#fill-blocks").addEventListener("click", fillDefaultBlocks);
  $("#instrument-filter").addEventListener("change", () => refresh().catch((error) => toast(error.message, "error")));

  function setTimeFilter(next) {
    timeFilter = next;
    document.querySelectorAll("[data-time-filter]").forEach((option) => {
      option.setAttribute("aria-pressed", String(option.dataset.timeFilter === next));
    });
  }

  document.querySelectorAll("[data-time-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      setTimeFilter(button.dataset.timeFilter);
      jumpToPeriod();
      render();
    });
  });

  window.addEventListener("toucan:instrument-changed", (event) => {
    user = event.detail.user;
    refresh().catch((error) => toast(error.message, "error"));
  });

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      [user, instruments] = await Promise.all([api.getSession(), api.listInstruments()]);
    } catch (error) {
      toast(error.message, "error");
      instruments = api.instruments;
    }

    instruments.forEach((instrument) => {
      const option = document.createElement("option");
      option.value = instrument.slug;
      option.textContent = instrument.name;
      $("#instrument-filter").appendChild(option);

      const row = element("label", "instrument-option");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "f-instruments";
      input.value = instrument.slug;
      row.append(input, element("span", "", instrument.name));
      $("#f-instruments").appendChild(row);
    });
    // A signed-in account already names an instrument, so the filter only
    // means something to a visitor browsing without one.
    $("#instrument-filter-field").hidden = Boolean(user);

    if (user?.role === "admin") {
      $("#new-class").hidden = false;
      $("#new-event").hidden = false;
      $("#day-new-class").hidden = false;
      $("#day-new-event").hidden = false;
    }
    try {
      await refresh();
    } catch (error) {
      renderScope();
      $("#day-event-list").innerHTML = `<p class="day-panel-error">${escapeHtml(error.message)}</p>`;
      toast(error.message, "error");
    }
  });
})();
