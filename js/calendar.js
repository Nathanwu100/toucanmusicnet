// Calendar: instrument-scoped student schedule and enrollment, volunteer
// signup, plus all-instrument admin management.

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
  const eventsForDate = (date) => events.filter((event) => sameDay(new Date(event.starts_at), date));
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

  function renderScope() {
    const scope = $("#calendar-scope");
    const filter = $("#admin-instrument-filter");
    if (!user) {
      scope.innerHTML = 'Log in to view your instrument schedule. <a href="login.html">Log in</a> or <a href="signup.html">create an account</a>.';
      filter.hidden = true;
      return;
    }
    if (user.role === "student") {
      filter.hidden = true;
      scope.textContent = user.instrument_name
        ? `Showing only ${user.instrument_name} classes and events for ${user.name}.`
        : "Choose an instrument in Settings to unlock your student calendar.";
      return;
    }
    if (user.role === "admin") {
      filter.hidden = false;
      const selected = $("#instrument-filter").selectedOptions[0]?.textContent;
      scope.textContent = $("#instrument-filter").value
        ? `Admin view: ${selected} classes and events.`
        : "Admin view: all instruments, classes, and events.";
      return;
    }
    filter.hidden = true;
    scope.textContent = "Volunteer view: all instruments, classes, and events.";
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

      dayEvents.slice(0, 1).forEach((event) => {
        const chip = element(
          "span",
          `chip ${event.event_type === "class" ? "class" : "event"}${event.is_enrolled ? " enrolled" : ""}`,
          `${fmtTime(event.starts_at)} ${event.title}`
        );
        cell.appendChild(chip);
      });
      if (dayEvents.length > 1) cell.appendChild(element("span", "chip-more", `+${dayEvents.length - 1} more`));
      cell.addEventListener("click", () => selectDate(date));
      daysGrid.appendChild(cell);
    }

    renderScope();
    renderDayPanel();
  }

  async function refresh() {
    $("#calendar-scope").textContent = "Refreshing schedule…";
    const filter = user?.role === "admin" ? $("#instrument-filter").value || null : null;
    events = await api.listEvents(filter);
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
  async function addStudentEnrollmentControls(body, event, isStudent, isAdmin, renderId) {
    if (event.event_type !== "class" || !user) return;
    const left = Math.max(0, Number(event.spots_left) || 0);
    const capacity = Math.max(0, Number(event.student_capacity) || 0);
    const capacityRow = element("div", "day-enrollment-row");
    const spotText = left === 0
      ? `Class full (0/${capacity} student spots)`
      : `${left}/${capacity} student spot${capacity === 1 ? "" : "s"} left`;
    const spots = element("span", `spots${left === 0 ? " full" : ""}`, spotText);
    capacityRow.appendChild(spots);

    if (isStudent) {
      const enrolled = event.is_enrolled === true;
      const action = element(
        "button",
        `btn btn-sm ${enrolled ? "btn-quiet" : "btn-beak"}`,
        enrolled ? "Leave class" : "Join class"
      );
      const started = new Date(event.starts_at).getTime() <= Date.now();
      action.disabled = !enrolled && (left === 0 || !event.enrollment_open || started);
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
            toast(`You joined “${event.title}” at ${fmtRange(event)}.`, "beak");
          }
          await refresh();
        } catch (error) {
          toast(error.message, "error");
          action.disabled = false;
        }
      });
      capacityRow.appendChild(action);
      if (enrolled) {
        body.appendChild(element("p", "enrollment-linked", `Enrolled · ${event.instrument_name} · time slot ${fmtRange(event)}`));
      }
    }
    body.appendChild(capacityRow);

    if (isAdmin) {
      try {
        const roster = await api.listClassEnrollments(event.id);
        if (renderId !== panelRenderId) return;
        body.appendChild(element(
          "p",
          "day-roster student-roster",
          roster.length
            ? `Students (${roster.length}/${event.student_capacity}): ${roster.map((entry) => entry.student_name).join(", ")}`
            : `Students (0/${event.student_capacity}): no active enrollments`
        ));
      } catch (error) {
        body.appendChild(element("p", "day-panel-error", error.message));
      }
    }
  }

  async function renderDayPanel() {
    const renderId = ++panelRenderId;
    const dayEvents = eventsForDate(selectedDate);
    $("#selected-day-title").textContent = selectedDate.toLocaleDateString([], {
      weekday: "long", month: "long", day: "numeric",
    });
    $("#selected-day-summary").textContent = dayEvents.length
      ? `${dayEvents.length} scheduled event${dayEvents.length === 1 ? "" : "s"}`
      : "Nothing scheduled";

    const list = $("#day-event-list");
    list.innerHTML = "";
    if (!dayEvents.length) {
      const empty = element("div", "day-empty");
      const icon = document.createElement("iconify-icon");
      icon.setAttribute("icon", "pixelarticons:calendar");
      icon.setAttribute("aria-hidden", "true");
      let message = "Select another day to see scheduled items.";
      if (!user) message = "Log in to view your instrument schedule.";
      else if (user.role === "student" && !user.instrument) message = "Choose an instrument in Settings to view classes.";
      else if (user.role === "admin") message = "Select another day, change the filter, or add an event here.";
      empty.append(icon, element("p", "", message));
      list.appendChild(empty);
      return;
    }

    for (const event of dayEvents) {
      const item = element("details", `day-event-item${event.is_enrolled ? " is-enrolled" : ""}`);
      const summary = element("summary", "day-event-summary");
      const summaryInner = element("span", "day-event-summary-inner");
      const summaryCopy = element("span", "day-event-summary-copy");
      const badges = element("span", "event-badges");
      badges.append(
        element("span", `event-type ${event.event_type}`, event.event_type),
        element("span", "instrument-badge", event.instrument_name || event.instrument)
      );
      if (event.is_enrolled) badges.appendChild(element("span", "enrolled-badge", "Enrolled"));
      summaryCopy.append(element("strong", "", event.title), element("span", "day-event-summary-time", fmtRange(event)));
      summaryInner.append(badges, summaryCopy);
      summary.appendChild(summaryInner);
      const body = element("div", "day-event-body");
      item.append(summary, body);
      addMetaRow(body, "pixelarticons:music", event.instrument_name || event.instrument);
      addMetaRow(body, "pixelarticons:clock", fmtRange(event));
      addMetaRow(body, "pixelarticons:map", event.location || "Location to be announced");
      if (event.description) body.appendChild(element("p", "day-event-description", event.description));

      const isAdmin = user?.role === "admin";
      const isVolunteer = user?.role === "volunteer";
      const isStudent = user?.role === "student";
      await addStudentEnrollmentControls(body, event, isStudent, isAdmin, renderId);
      if (renderId !== panelRenderId) return;

      if ((isAdmin || isVolunteer) && event.volunteer_capacity > 0) {
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
            const action = element("button", `btn btn-sm ${mine ? "btn-quiet" : "btn-beak"}`, mine ? "Withdraw" : "Volunteer");
            action.disabled = !mine && left === 0;
            action.addEventListener("click", async () => {
              action.disabled = true;
              try {
                if (mine) {
                  await api.volunteerCancel(event.id, user);
                  toast(`You withdrew from “${event.title}”.`);
                } else {
                  await api.volunteerSignup(event.id, user);
                  toast(`You are volunteering for “${event.title}”.`, "beak");
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
      } else if (isVolunteer) {
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
      list.appendChild(item);
    }
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
    $("#f-instrument").value = event?.instrument || instruments[0]?.slug || "";
    $("#f-start").value = event ? toLocalInput(event.starts_at) : toLocalInput(defaultStart);
    $("#f-end").value = event?.ends_at ? toLocalInput(event.ends_at) : toLocalInput(defaultEnd);
    $("#f-location").value = event?.location || "";
    $("#f-capacity").value = event?.volunteer_capacity ?? 2;
    $("#f-student-capacity").value = event?.student_capacity || 12;
    $("#f-enrollment-open").checked = event ? event.enrollment_open : true;
    $("#f-description").value = event?.description || "";
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
    if (!$("#f-title").value.trim() || !$("#f-instrument").value || !start || !end) {
      errorBox.textContent = "Title, instrument, start, and end are required.";
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
      instrument: $("#f-instrument").value,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
      location: $("#f-location").value.trim(),
      volunteer_capacity: Math.max(0, parseInt($("#f-capacity").value, 10) || 0),
      student_capacity: studentCapacity,
      enrollment_open: eventType === "class" && $("#f-enrollment-open").checked,
      description: $("#f-description").value.trim(),
    };

    if (editingId) {
      const previous = events.find((candidate) => candidate.id === editingId);
      const active = Number(previous?.active_enrollments) || 0;
      const scheduleChanged = previous && (
        previous.instrument !== data.instrument || previous.starts_at !== data.starts_at ||
        previous.ends_at !== data.ends_at || previous.event_type !== data.event_type
      );
      if (active && scheduleChanged) {
        errorBox.textContent = `This class has ${active} active student enrollment${active === 1 ? "" : "s"}. Students must leave or transfer before its instrument or time slot can change.`;
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
        toast("Event added to the calendar.", "beak");
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
  $("#instrument-filter").addEventListener("change", () => refresh().catch((error) => toast(error.message, "error")));

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

    for (const select of [$("#instrument-filter"), $("#f-instrument")]) {
      instruments.forEach((instrument) => {
        const option = document.createElement("option");
        option.value = instrument.slug;
        option.textContent = instrument.name;
        select.appendChild(option);
      });
    }
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
