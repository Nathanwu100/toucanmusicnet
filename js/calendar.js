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

  function selectDate(date) {
    selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    current = new Date(date.getFullYear(), date.getMonth(), 1);
    render();
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
      cell.addEventListener("click", () => selectDate(date));
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

  const blocksOf = (event) => (Array.isArray(event.blocks) ? event.blocks : []);

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

  function blockCard(event, block, { isStudent, isAdmin, mine, joinable }) {
    const card = element("div", "block-card");
    card.dataset.blockId = block.id;
    card.dataset.instrument = block.instrument;
    if (block.is_mine) card.classList.add("is-mine");
    if (!block.spots_left) card.classList.add("is-full");

    card.append(
      element("span", "block-time", `${fmtTime(block.starts_at)} - ${fmtTime(block.ends_at)}`),
      element("strong", "block-name", block.label || "Session")
    );
    const left = Number(block.spots_left) || 0;
    card.appendChild(element(
      "span",
      `block-spots${left === 0 ? " full" : ""}`,
      block.is_mine ? "You are in this one" : left === 0 ? "Full" : `${left} of ${block.capacity} left`
    ));

    if (isAdmin) {
      card.draggable = true;
      card.classList.add("is-draggable");
      card.title = "Drag to move this block";
    } else if (isStudent && joinable) {
      const action = element("button", `btn btn-sm ${mine ? "btn-quiet" : "btn-primary"}`,
        mine ? "Leave" : "Take this slot");
      action.disabled = !mine && left === 0;
      action.addEventListener("click", async () => {
        action.disabled = true;
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
          action.disabled = false;
        }
      });
      card.appendChild(action);
    }
    return card;
  }

  function renderBlockGrid(event, { isStudent, isAdmin }) {
    const host = $("#class-timetable");
    const columns = instrumentColumns(event);
    if (!host || !columns.some((column) => column.blocks.length)) return false;

    host.hidden = false;
    host.innerHTML = "";
    host.dataset.eventId = event.id;

    const head = element("div", "timetable-head");
    const copy = element("div", "");
    copy.append(
      element("p", "eyebrow", "Timetable"),
      element("h2", "", event.title),
      element("p", "timetable-when",
        `${new Date(event.starts_at).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · ${fmtRange(event)}` +
        (event.location ? ` · ${event.location}` : ""))
    );
    head.appendChild(copy);
    if (isAdmin) {
      head.appendChild(element("p", "timetable-hint", "Drag a block to move it, or to another instrument's column."));
    } else if (isStudent) {
      head.appendChild(element("p", "timetable-hint", "Pick a slot in your instrument's column."));
    }
    host.appendChild(head);

    const body = host;
    const grid = element("div", "block-grid");
    grid.style.setProperty("--block-columns", String(columns.length));
    const enrolledBlockId = blocksOf(event).find((block) => block.is_mine)?.id || null;
    const open = event.enrollment_open && !hasEnded(event);

    for (const column of columns) {
      const lane = element("div", "block-column");
      lane.dataset.instrument = column.slug;
      const head = element("div", "block-column-head");
      head.appendChild(element("span", "instrument-badge", column.name));
      head.dataset.instrument = column.slug;
      lane.appendChild(head);

      const stack = element("div", "block-stack");
      stack.dataset.instrument = column.slug;
      if (!column.blocks.length) {
        stack.appendChild(element("p", "block-empty", "Nothing scheduled"));
      }
      for (const block of column.blocks) {
        stack.appendChild(blockCard(event, block, {
          isStudent,
          isAdmin,
          mine: block.id === enrolledBlockId,
          // Students only book in their own instrument's column.
          joinable: open && isStudent && column.slug === user?.instrument,
        }));
      }
      lane.appendChild(stack);
      grid.appendChild(lane);
    }

    if (isStudent && !columns.some((column) => column.slug === user?.instrument)) {
      body.appendChild(element("p", "block-note",
        "This class does not have a column for your instrument."));
    }
    body.appendChild(grid);
    if (isAdmin) enableBlockDragging(grid, event);
    return true;
  }


  // Dragging a block moves it in time, and moving it into another column
  // changes which instrument it is for. The drop target is a gap between
  // cards, so the block takes the start time of whatever it lands in front
  // of and keeps its own length. Everything is validated server-side too --
  // this only ever proposes a change.
  function enableBlockDragging(grid, event) {
    let dragging = null;

    grid.addEventListener("dragstart", (dragEvent) => {
      const card = dragEvent.target.closest(".block-card");
      if (!card) return;
      dragging = card;
      card.classList.add("is-dragging");
      dragEvent.dataTransfer.effectAllowed = "move";
      // Firefox will not start a drag without payload.
      dragEvent.dataTransfer.setData("text/plain", card.dataset.blockId);
    });

    grid.addEventListener("dragend", () => {
      dragging?.classList.remove("is-dragging");
      grid.querySelectorAll(".block-stack").forEach((stack) => stack.classList.remove("is-target"));
      dragging = null;
    });

    grid.addEventListener("dragover", (dragEvent) => {
      if (!dragging) return;
      const stack = dragEvent.target.closest(".block-stack");
      if (!stack) return;
      dragEvent.preventDefault();
      dragEvent.dataTransfer.dropEffect = "move";
      grid.querySelectorAll(".block-stack").forEach((other) => {
        other.classList.toggle("is-target", other === stack);
      });
    });

    grid.addEventListener("drop", async (dragEvent) => {
      if (!dragging) return;
      const stack = dragEvent.target.closest(".block-stack");
      if (!stack) return;
      dragEvent.preventDefault();

      const moved = blocksOf(event).find((block) => block.id === dragging.dataset.blockId);
      if (!moved) return;
      const instrument = stack.dataset.instrument;

      // Where in the column did it land? The card it was dropped in front of
      // donates its start time; dropping past the end appends after the last.
      const siblings = [...stack.querySelectorAll(".block-card")].filter((card) => card !== dragging);
      const before = siblings.find((card) => {
        const box = card.getBoundingClientRect();
        return dragEvent.clientY < box.top + box.height / 2;
      });

      const length = new Date(moved.ends_at) - new Date(moved.starts_at);
      const classStart = new Date(event.starts_at).getTime();
      const classEnd = new Date(event.ends_at || event.starts_at).getTime();

      let startsAt;
      if (before) {
        const target = blocksOf(event).find((block) => block.id === before.dataset.blockId);
        startsAt = new Date(target.starts_at).getTime();
      } else {
        const last = siblings[siblings.length - 1];
        const target = last && blocksOf(event).find((block) => block.id === last.dataset.blockId);
        startsAt = target ? new Date(target.ends_at).getTime() : classStart;
      }
      const snap = SNAP_MINUTES * 60000;
      startsAt = Math.round(startsAt / snap) * snap;
      // Never let a drag push a block outside the class it belongs to.
      startsAt = Math.max(classStart, Math.min(startsAt, classEnd - length));

      const next = blocksOf(event)
        .map((block) => (block.id === moved.id
          ? {
              ...block,
              instrument,
              starts_at: new Date(startsAt).toISOString(),
              ends_at: new Date(startsAt + length).toISOString(),
            }
          : block))
        .map(({ taken, spots_left, is_mine, instrument_name, ...keep }) => keep);

      try {
        await api.updateEvent(event.id, { ...eventFields(event), blocks: next });
        toast(`Moved "${moved.label}" to ${fmtTime(new Date(startsAt).toISOString())}.`, "success");
        await refresh();
      } catch (error) {
        toast(error.message, "error");
        await refresh();
      }
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
    ["Student", "Instrument", "Slot", "Email", "Phone"].forEach((label) => {
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
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
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
        renderBlockGrid(event, { isStudent, isAdmin });
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
      renderBlockGrid(event, { isStudent, isAdmin });
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
          if (!confirm(`Delete “${event.title}”? Volunteer signups will also be removed.`)) return;
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
  // One row per block: name, which instrument column it belongs to, when it
  // runs, and how many fit. Instrument choices follow the checkboxes above,
  // so a block can never name an instrument the class does not teach.
  function blockEditorRow(block = {}) {
    const row = element("div", "block-row");
    row.dataset.blockId = block.id || "";

    const name = document.createElement("input");
    name.type = "text";
    name.className = "block-row-name";
    name.placeholder = "Beginners";
    name.value = block.label || "";
    name.setAttribute("aria-label", "Time block name");

    const instrument = document.createElement("select");
    instrument.className = "block-row-instrument";
    instrument.setAttribute("aria-label", "Instrument");

    const start = document.createElement("input");
    start.type = "time";
    start.className = "block-row-time";
    start.setAttribute("aria-label", "Starts");

    const end = document.createElement("input");
    end.type = "time";
    end.className = "block-row-time";
    end.setAttribute("aria-label", "Ends");

    const seats = document.createElement("input");
    seats.type = "number";
    seats.min = "1";
    seats.max = "99";
    seats.className = "block-row-seats";
    seats.value = block.capacity || 4;
    seats.setAttribute("aria-label", "Places");

    if (block.starts_at) start.value = toTimeInput(block.starts_at);
    if (block.ends_at) end.value = toTimeInput(block.ends_at);
    instrument.dataset.selected = block.instrument || "";

    const remove = element("button", "icon-btn btn btn-sm block-row-remove", "");
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove this time block");
    remove.innerHTML = '<iconify-icon icon="pixelarticons:close" aria-hidden="true"></iconify-icon>';
    remove.addEventListener("click", () => row.remove());

    row.append(name, instrument, start, end, seats, remove);
    return row;
  }

  const toTimeInput = (iso) => {
    const date = new Date(iso);
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  // Instrument dropdowns are rebuilt whenever the checkboxes change, so
  // unticking an instrument cannot leave a block stranded on it.
  function syncBlockInstruments() {
    const chosen = [...document.querySelectorAll("#f-instruments input:checked")]
      .map((input) => ({ slug: input.value, name: input.closest("label").textContent.trim() }));
    document.querySelectorAll("#f-blocks .block-row-instrument").forEach((select) => {
      const keep = select.value || select.dataset.selected || "";
      select.innerHTML = "";
      chosen.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.slug;
        option.textContent = item.name;
        select.appendChild(option);
      });
      select.value = chosen.some((item) => item.slug === keep) ? keep : (chosen[0]?.slug || "");
      select.dataset.selected = select.value;
    });
  }

  // Times are entered as clock times; the class's own date supplies the day.
  function collectBlocks() {
    const day = $("#f-start").value.slice(0, 10);
    if (!day) return [];
    return [...document.querySelectorAll("#f-blocks .block-row")].map((row) => {
      const [start, end] = row.querySelectorAll(".block-row-time");
      return {
        id: row.dataset.blockId || undefined,
        label: row.querySelector(".block-row-name").value.trim() || "Session",
        instrument: row.querySelector(".block-row-instrument").value,
        starts_at: new Date(`${day}T${start.value || "00:00"}`).toISOString(),
        ends_at: new Date(`${day}T${end.value || "00:00"}`).toISOString(),
        capacity: parseInt(row.querySelector(".block-row-seats").value, 10) || 1,
      };
    });
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
    const blockHost = $("#f-blocks");
    blockHost.innerHTML = "";
    (event?.blocks || []).forEach((block) => blockHost.appendChild(blockEditorRow(block)));
    syncBlockInstruments();
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
  $("#f-type").addEventListener("change", syncClassFields);
  $("#add-block").addEventListener("click", () => {
    $("#f-blocks").appendChild(blockEditorRow());
    syncBlockInstruments();
  });
  $("#f-instruments").addEventListener("change", syncBlockInstruments);
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
