"use strict";
"require baseclass";
"require fs";
"require ui";

function render(renderNotice) {
  const writable = !!L.hasViewPermission();
  const input = E("input", {
    id: "pq-home-ipv6",
    type: "checkbox",
    role: "switch",
    "aria-describedby": "pq-home-ipv6-state",
  });
  const state = E("p", { id: "pq-home-ipv6-state", class: "pq-meta" }, _("Loading..."));
  const feedback = E("p", { class: "pq-meta", role: "status" });
  const warning = renderNotice(
    "warning",
    _("IPv6 may interfere with the VPN"),
    _("Turn it off if some services do not open through the VPN."),
  );
  warning.hidden = true;
  const notice = E("div", { class: "pq-stack pq-stack--item" }, [
    E("p", { class: "pq-meta" }, _("PostQ turned off IPv6 advertisements on the home LAN. The router keeps its WAN settings.")),
    E("button", { type: "button", class: "pq-link-action", disabled: !writable || null, click: () => change("accept") }, _("Got it")),
  ]);
  const node = E("div", { class: "pq-ipv6 pq-stack pq-stack--group" }, [
    E("div", { class: "pq-ipv6__row" }, [
      E("div", { class: "pq-ipv6__titles" }, [
        E("label", { for: input.id, class: "pq-body" }, _("IPv6 on the home LAN")),
        state,
      ]),
      E("div", { class: "pq-ipv6__switch" }, [
        input,
        E("span", { class: "pq-ipv6__track", "aria-hidden": "true" }),
      ]),
    ]),
    warning,
    E("details", {}, [
      E("summary", { class: "pq-link-action" }, _("Why is that?")),
      E("p", { class: "pq-meta" }, _("Some VPN servers do not support IPv6. Turning it off on the home LAN lets devices connect over IPv4. The router can still use IPv6 on the WAN.")),
    ]),
    notice,
    feedback,
  ]);
  let busy = false;
  let revision = 0;
  input.disabled = true;
  notice.hidden = true;

  async function refresh() {
    const request = ++revision;
    try {
      const res = await fs.exec("/usr/bin/postq", ["lan_ipv6_status"]);
      if (res.code !== 0) throw new Error();
      const status = JSON.parse(res.stdout);
      if (request !== revision) return;
      input.checked = !!status.enabled;
      input.disabled = busy || !status.available || !writable;
      notice.hidden = !status.notice;
      warning.hidden = !status.available || !status.enabled;
      state.textContent = !status.available
        ? _("Home LAN IPv6 settings are unavailable.")
        : status.enabled
          ? _("On — some services may connect outside the VPN")
          : _("Off — the VPN works more reliably");
    } catch {
      if (request !== revision) return;
      input.disabled = true;
      warning.hidden = true;
      state.textContent = _("Home LAN IPv6 settings are unavailable.");
    }
  }

  async function change(action) {
    if (busy) return;
    busy = true;
    ++revision;
    input.disabled = true;
    try {
      const res = await fs.exec("/usr/libexec/postq-lan-ipv6", [action]);
      if (res.code !== 0) throw new Error();
      feedback.textContent = action === "accept" ? "" : _("Reconnect devices to the home network to renew their addresses.");
    } catch {
      feedback.textContent = _("Could not save the home LAN IPv6 settings.");
    } finally {
      busy = false;
      await refresh();
    }
  }

  input.addEventListener("change", () => {
    if (!input.checked) {
      change("off");
      return;
    }
    input.checked = false;
    ui.showModal(_("Enable IPv6 on the home LAN?"), [
      E("p", {}, _("Devices may connect over IPv6 outside the VPN.")),
      E("div", { class: "pq-dns__actions" }, [
        E("button", { type: "button", class: "btn", click: () => ui.hideModal() }, _("Cancel")),
        E("button", { type: "button", class: "btn cbi-button-action", click: () => {
          ui.hideModal();
          change("on");
        } }, _("Enable")),
      ]),
    ], "pq-modal");
  });

  refresh();
  const timer = setInterval(() => {
    if (!node.isConnected) clearInterval(timer);
    else if (!document.hidden && !busy) refresh();
  }, 60000);
  return node;
}

return baseclass.extend({ render });
