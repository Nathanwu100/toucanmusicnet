// Calendar page: selectable month grid, a persistent day-details panel,
// volunteer signup, and admin event management.

(function () {
  const api = window.ToucanAPI;
  const $ = (sel) => document.querySelector(sel);

  let user = null;
  let events = [];
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

  const fmtTime = (iso) =>
    new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const fmtRange = (ev) => {
    const start = fmtTime(ev.starts_at);
    return ev.ends_at ? `${start} - ${fmtTime(ev.ends_at)}` : start;
  };

  const sameDay = (left, right) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

  const eventsForDate = (date) =>
    events.filter((ev) => sameDay(new Date(ev.starts_at), date));

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
    for (let i = 0; i < firstDow; i += 1) {
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
      cell.setAttribute(
        "aria-label",
        `${date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`
      );
      cell.appendChild(element("span", "d", String(day)));

      dayEvents.slice(0, 1).forEach((ev) => {
        const chip = element(
          "span",
          `chip ${ev.event_type === "class" ? "class" : "event"}`,
          `${fmtTime(ev.starts_at)} ${ev.title}`
        );
        cell.appendChild(chip);
      });
      if (dayEvents.length > 1) {
        cell.appendChild(element("span", "chip-more", `+${dayEvents.length - 1} more`));
      }

      cell.addEventListener("click", () => selectDate(date));
      daysGrid.appendChild(cell);
    }

    renderDayPanel();
  }

  async function refresh() {
    events = await api.listEvents();
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

  async function renderDayPanel() {
    const renderId = ++panelRenderId;
    const dayEvents = eventsForDate(selectedDate);
    $("#selected-day-title").textContent = selectedDate.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
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
      empty.append(icon, element("p", "", "Select another day, or add an event here."));
      list.appendChild(empty);
      return;
    }

    for (const ev of dayEvents) {
      const item = element("details", "day-event-item");
      const summary = element("summary", "day-event-summary");
      const summaryInner = element("span", "day-event-summary-inner");
      const summaryCopy = element("span", "day-event-summary-copy");
      const type = element("span", `event-type ${ev.event_type}`, ev.event_type);
      summaryCopy.append(
        element("strong", "", ev.title),
        element("span", "day-event-summary-time", fmtRange(ev))
      );
      summaryInner.append(type, summaryCopy);
      summary.appendChild(summaryInner);
      const body = element("div", "day-event-body");
      item.append(summary, body);
      addMetaRow(body, "pixelarticons:clock", fmtRange(ev));
      addMetaRow(body, "pixelarticons:map", ev.location || "Location to be announced");
      if (ev.description) body.appendChild(element("p", "day-event-description", ev.description));

      const isAdmin = user && user.role === "admin";
      const isVolunteer = user && user.role === "volunteer";
      if ((isAdmin || isVolunteer) && ev.volunteer_capacity > 0) {
        try {
          const { count, mine } = await api.signupStatus(ev.id, user);
          if (renderId !== panelRenderId) return;
          const left = Math.max(0, ev.volunteer_capacity - count);
          const volunteerRow = element("div", "day-volunteer-row");
          const spots = element(
            "span",
            `spots${left === 0 ? " full" : ""}`,
            `${left}/${ev.volunteer_capacity} volunteer spot${ev.volunteer_capacity === 1 ? "" : "s"} left`
          );
          volunteerRow.appendChild(spots);

          if (isVolunteer) {
            const signup = element(
              "button",
              `btn btn-sm ${mine ? "btn-quiet" : "btn-beak"}`,
              mine ? "Withdraw" : "Volunteer"
            );
            signup.disabled = !mine && left === 0;
            signup.addEventListener("click", async () => {
              signup.disabled = true;
              try {
                if (mine) {
                  await api.volunteerCancel(ev.id, user);
                  toast(`You have withdrawn from "${ev.title}".`);
                } else {
                  await api.volunteerSignup(ev.id, user);
                  toast(`You are signed up for "${ev.title}".`, "beak");
                }
                renderDayPanel();
              } catch (error) {
                toast(error.message, "error");
                signup.disabled = false;
              }
            });
            volunteerRow.appendChild(signup);
          }
          body.appendChild(volunteerRow);

          if (isAdmin) {
            const names = await api.listSignups(ev.id);
            if (renderId !== panelRenderId) return;
            body.appendChild(
              element(
                "p",
                "day-roster",
                names.length
                  ? `Signed up: ${names.map((entry) => entry.user_name).join(", ")}`
                  : "Signed up: no one yet"
              )
            );
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
        edit.addEventListener("click", () => openEditor(ev));
        remove.addEventListener("click", async () => {
          if (!confirm(`Delete "${ev.title}"? Volunteer signups for it will also be removed.`)) return;
          remove.disabled = true;
          try {
            await api.deleteEvent(ev.id);
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

  function openEditor(ev) {
    editingId = ev ? ev.id : null;
    const defaultStart = new Date(
      selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 16, 0
    );
    const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);
    $("#e-title").textContent = ev
      ? "Edit event"
      : `New event for ${selectedDate.toLocaleDateString([], { month: "long", day: "numeric" })}`;
    $("#e-error").classList.remove("show");
    $("#f-title").value = ev ? ev.title : "";
    $("#f-type").value = ev ? ev.event_type : "class";
    $("#f-start").value = ev ? toLocalInput(ev.starts_at) : toLocalInput(defaultStart);
    $("#f-end").value = ev && ev.ends_at ? toLocalInput(ev.ends_at) : toLocalInput(defaultEnd);
    $("#f-location").value = ev ? ev.location || "" : "";
    $("#f-capacity").value = ev ? ev.volunteer_capacity : 2;
    $("#f-description").value = ev ? ev.description || "" : "";
    $("#edit-backdrop").classList.add("open");
    $("#f-title").focus();
  }

  $("#event-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = $("#e-error");
    errorBox.classList.remove("show");
    const start = $("#f-start").value;
    const end = $("#f-end").value;
    if (!$("#f-title").value.trim() || !start || !end) {
      errorBox.textContent = "Title, start, and end are required.";
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
      event_type: $("#f-type").value,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
      location: $("#f-location").value.trim(),
      volunteer_capacity: Math.max(0, parseInt($("#f-capacity").value, 10) || 0),
      description: $("#f-description").value.trim(),
    };

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

  document.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", closeModals)
  );
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) =>
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeModals();
    })
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModals();
  });

  $("#prev").addEventListener("click", () => {
    const target = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    selectDate(target);
  });
  $("#next").addEventListener("click", () => {
    const target = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    selectDate(target);
  });
  $("#new-event").addEventListener("click", () => openEditor(null));
  $("#day-new-event").addEventListener("click", () => openEditor(null));

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      user = await api.getSession();
    } catch (error) {
      user = null;
    }
    if (user && user.role === "admin") {
      $("#new-event").hidden = false;
      $("#day-new-event").hidden = false;
    }
    try {
      await refresh();
    } catch (error) {
      toast(error.message, "error");
    }
  });
})();
