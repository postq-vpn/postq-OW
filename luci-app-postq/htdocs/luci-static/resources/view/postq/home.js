"use strict";
"require baseclass";
"require fs";
"require rpc";
"require uci";
"require ui";
"require view.postq.main as main";
"require view.postq.control as control";
"require view.postq.lan_ipv6 as lanIPv6";

// PostQ: the main page, laid out like the PostQ XKeen panel. A header of
// "pills" (logo, updates, diagnostics, the router's own settings, log out) over
// two columns: the subscription and the router on the left, the VPN on the
// right (the power button, the servers and the log for support). Everything is
// drawn here from the backend's answers; nothing of the LuCI form is shown.

const SECTION = "main";
const STATUS_INTERVAL = 4000;
const SERVERS_INTERVAL = 15000;
const INFO_INTERVAL = 30000;
const ROUTER_INTERVAL = 3000;
// A real request through the server: from 800 ms on it is slow.
const SLOW_PING_MS = 800;
const PING_CONCURRENCY = 6;
// The oldest sing-box-extended release that carries the XHTTP fixes the PostQ
// servers need (SB_EXTENDED_MIN_RELEASE / SB_EXTENDED_MIN_VERSION in the
// backend's constants.sh): an older core leaves those servers out of the list.
const CORE_MIN_RELEASE = [2, 7, 3];
const CORE_MIN_VERSION = "1.14.3-extended-2.7.3";

const CABINET_URL = "https://web.postq.space";
const CABINET_SUPPORT_URL = "https://web.postq.space/support";
const SUPPORT_BOT_URL = "https://t.me/postq_vpn_support_bot";

const callBoard = rpc.declare({ object: "system", method: "board" });
const callInfo = rpc.declare({ object: "system", method: "info" });

// Lucide icons (stroke 2, 24×24), as the XKeen panel uses them.
const ICON_PATHS = {
  download:
    '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  activity:
    '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  router:
    '<rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6.01 18H6"/><path d="M10.01 18H10"/><path d="M15 10v4"/><path d="M17.84 7.17a4 4 0 0 0-5.66 0"/><path d="M20.66 4.34a8 8 0 0 0-11.31 0"/>',
  logout:
    '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  refresh:
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  dots: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  arrow: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  alert:
    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
};

// The PostQ VPN mark (the logo without the name), in currentColor.
const MARK_PATH =
  "M20.0066 3.64269C20.0066 4.41765 20.3154 5.16087 20.8649 5.70886L20.8881 5.73194C21.4377 6.27992 22.183 6.58778 22.9602 6.58778H26.4802C28.0986 6.58778 29.4106 7.896 29.4106 9.50978V19.4977C29.4106 21.1115 28.0986 22.4197 26.4802 22.4197H23.7362C22.1178 22.4197 20.8058 21.1115 20.8058 19.4977V9.00156C20.8058 8.2266 20.4971 7.48338 19.9476 6.9354L19.8179 6.80608C19.2683 6.2581 18.5229 5.95025 17.7458 5.95025H11.7493C10.7024 5.95025 9.73497 6.50718 9.2115 7.41125L8.99732 7.78116C8.74012 8.22536 8.60472 8.72924 8.60472 9.24216V22.025C8.60472 22.7999 8.91346 23.5432 9.46302 24.0911L9.56609 24.1939C10.1157 24.7419 10.861 25.0498 11.6382 25.0498H17.7955C19.4139 25.0498 20.7259 26.358 20.7259 27.9718V28.078C20.7259 29.6918 19.4139 31 17.7955 31H12.281C10.6626 31 9.35064 29.6918 9.35064 28.078V27.3307C9.35064 26.5558 9.04191 25.8125 8.49235 25.2646L8.3624 25.135C7.81284 24.587 7.06748 24.2791 6.29029 24.2791H2.9304C1.31199 24.2791 0 22.9709 0 21.3571V11.3692C0 9.75545 1.31199 8.44723 2.9304 8.44723H5.16642C6.21336 8.44723 7.18076 7.8903 7.70423 6.98622L8.23877 6.06302C8.49596 5.61882 8.63136 5.11494 8.63136 4.60203V2.922C8.63136 1.30822 9.94335 0 11.5618 0H17.0762C18.6947 0 20.0066 1.30822 20.0066 2.922V3.64269Z";

function icon(name, size = 20, extraClass = "") {
  const span = E("span", { class: `pq-icon ${extraClass}`.trim(), "aria-hidden": "true" });

  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${name === "check" ? 3 : 2.25}" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;

  return span;
}

function mark(width, extraClass = "") {
  const span = E("span", { class: `pq-icon ${extraClass}`.trim(), "aria-hidden": "true" });
  const height = Math.round((width * 31) / 29.42);

  span.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 29.42 31" fill="currentColor"><path d="${MARK_PATH}"/></svg>`;

  return span;
}

function spinner(extraClass = "") {
  return E("span", { class: `pq-spinner ${extraClass}`.trim(), "aria-hidden": "true" });
}

function lang() {
  return (document.documentElement.lang || "").toLowerCase();
}

function plural(n, forms) {
  return main.pluralForm(n, forms, lang());
}

const BYTE_UNITS = () => [_("B"), _("KB"), _("MB"), _("GB"), _("TB")];

// 21 474 836 480 → "20 GB": one decimal under 100, like the XKeen panel.
function formatBytes(bytes) {
  const units = BYTE_UNITS();
  const exponent =
    bytes > 0
      ? Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1)
      : 0;
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 || value >= 100 ? 0 : 1;

  return `${value.toLocaleString(lang() || undefined, { maximumFractionDigits: digits })} ${units[exponent]}`;
}

function formatDate(seconds) {
  return new Date(seconds * 1000).toLocaleDateString(lang() || undefined, {
    day: "numeric",
    month: "long",
  });
}

// "🇳🇱 Нидерланды | AI" → the name and the provider's note.
function splitServerName(name) {
  const [first, ...rest] = String(name || "").split("|");

  return { main: first.trim(), note: rest.join("|").trim() };
}

function isGroup(outbound) {
  const type = String(outbound.type || "").toLowerCase();

  return type === "urltest" || type === "selector";
}

// PostQ: a Russian server, by its name (the 🇷🇺 flag, "Россия" or "Russia").
// The same names the backend leaves out of the Auto group.
function isRussian(outbound) {
  const name = String(outbound.displayName || "").toLowerCase();

  return (
    name.includes("🇷🇺") || name.includes("росси") || name.includes("russia")
  );
}

// "1.14.3-extended-2.7.3-lite" → true; a stock or older extended core → false.
function coreMeetsMinimum(version) {
  const parts = String(version || "").split("-extended-");

  if (parts.length < 2) {
    return false;
  }

  const release = parts[1].split("-")[0].split(".").map((n) => Number(n) || 0);

  for (let i = 0; i < CORE_MIN_RELEASE.length; i++) {
    if ((release[i] || 0) !== CORE_MIN_RELEASE[i]) {
      return (release[i] || 0) > CORE_MIN_RELEASE[i];
    }
  }

  return true;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const withoutFragment = (url) => String(url || "").split("#")[0];

function subscriptionUrls() {
  const value = uci.get("postq", SECTION, "subscription_url");

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return value ? [value] : [];
}

// Saves the list of subscriptions and applies it (PostQ restarts with it).
async function applyUrls(urls) {
  if (urls.length) {
    // the links count only in a section of the subscription type
    uci.set("postq", SECTION, "connection_type", "proxy");
    uci.set("postq", SECTION, "proxy_config_type", "subscription");
    uci.set("postq", SECTION, "subscription_url", urls);
  } else {
    uci.unset("postq", SECTION, "subscription_url");
  }

  await uci.save();
  ui.changes.apply(true);
}

// A small drop-down under a button (the "…" of the subscription, "Support").
// Items: { title, subtitle, href?, danger?, action? }.
function dropdown(trigger, items, align = "end") {
  const wrap = E("div", { class: "pq-dropdown" });
  const menu = E("div", {
    class: `pq-menu pq-menu--${align}`,
    role: "menu",
    hidden: "",
  });

  function close() {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", outside, true);
    document.removeEventListener("keydown", onKey, true);
  }

  function outside(ev) {
    if (!wrap.contains(ev.target)) {
      close();
    }
  }

  function onKey(ev) {
    if (ev.key === "Escape") {
      close();
      trigger.focus();
    }
  }

  items.forEach((item) => {
    const content = [
      E(
        "span",
        { class: `pq-menu__title${item.danger ? " pq-menu__title--danger" : ""}` },
        item.title,
      ),
      item.subtitle ? E("span", { class: "pq-menu__sub" }, item.subtitle) : "",
    ];
    const el = item.href
      ? E(
          "a",
          {
            class: "pq-menu__item",
            role: "menuitem",
            href: item.href,
            target: "_blank",
            rel: "noopener noreferrer",
            click: () => close(),
          },
          content,
        )
      : E(
          "button",
          {
            type: "button",
            class: "pq-menu__item",
            role: "menuitem",
            click: (ev) => {
              ev.preventDefault();
              close();
              item.action();
            },
          },
          content,
        );

    menu.appendChild(el);
  });

  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (menu.hidden) {
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      document.addEventListener("click", outside, true);
      document.addEventListener("keydown", onKey, true);
    } else {
      close();
    }
  });

  wrap.append(trigger, menu);

  return wrap;
}

// A grey tile of the card: a label, a value and something under them.
function statTile(label, value, footer) {
  return E("div", { class: "pq-tile" }, [
    E("div", { class: "pq-tile__head" }, [
      E("span", { class: "pq-body pq-caption" }, label),
      E("span", { class: "pq-value" }, value),
    ]),
    footer ? E("div", { class: "pq-tile__foot" }, footer) : "",
  ]);
}

function progress(percent, label) {
  const value = Math.max(0, Math.min(100, percent || 0));

  return E(
    "div",
    {
      class: "pq-progress",
      role: "progressbar",
      "aria-label": label,
      "aria-valuenow": String(Math.round(value)),
      "aria-valuemin": "0",
      "aria-valuemax": "100",
    },
    [E("div", { class: "pq-progress__bar", style: `width:${value}%` })],
  );
}

function notice(tone, title, text) {
  return E("div", { class: `pq-notice pq-notice--${tone}`, role: "status" }, [
    icon(tone === "error" ? "alert" : "clock", 22, "pq-notice__icon"),
    E("div", { class: "pq-notice__text" }, [
      E("span", { class: "pq-body pq-notice__title" }, title),
      text ? E("span", { class: "pq-meta" }, text) : "",
    ]),
  ]);
}

function infinityMark() {
  const span = E("span", { class: "pq-infinity", "aria-hidden": "true" });

  span.innerHTML =
    '<svg width="32" height="18" viewBox="0 0 18 10" fill="none" overflow="visible"><path d="M9 5C9 5 6.80914 9 4.6 9C2.39086 9 1 7.20912 1 5C1 2.79086 2.39086 1 4.6 1C6.80914 1 9 5 9 5ZM9 5C9 5 11.1909 9 13.4 9C15.6091 9 17 7.20912 17 5C17 2.79086 15.6091 1 13.4 1C11.1909 1 9 5 9 5Z" stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>';

  return span;
}

// The dialog with the link: a new subscription or another link for one.
function linkDialog(title, value, submitText, onSubmit) {
  const input = E("input", {
    type: "url",
    class: "pq-input",
    value: value || "",
    placeholder: _("Paste the subscription link https://…"),
    "aria-label": _("Subscription link"),
    required: "",
  });
  const error = E("p", { class: "pq-field-error" });

  ui.showModal(
    title,
    [
      E(
        "form",
        {
          class: "pq-link-form",
          submit: (ev) => {
            ev.preventDefault();

            const url = input.value.trim();
            const check = main.validateUrl(url);

            if (!check.valid) {
              error.textContent = check.message;
              return;
            }

            ui.hideModal();
            onSubmit(url);
          },
        },
        [
          input,
          error,
          E("div", { class: "pq-upd__actions" }, [
            E(
              "button",
              {
                type: "button",
                class: "pq-btn-tile pq-btn-tile--muted",
                click: (ev) => {
                  ev.preventDefault();
                  ui.hideModal();
                },
              },
              _("Cancel"),
            ),
            E("button", { type: "submit", class: "pq-btn" }, submitText),
          ]),
        ],
      ),
    ],
    "pq-modal",
  );
  setTimeout(() => input.focus(), 0);
}

function confirmDialog(title, text, actionText, onConfirm) {
  ui.showModal(
    title,
    [
      E("p", { class: "pq-body pq-text" }, text),
      E("div", { class: "pq-upd__actions" }, [
        E(
          "button",
          {
            type: "button",
            class: "pq-btn-tile pq-btn-tile--muted",
            click: (ev) => {
              ev.preventDefault();
              ui.hideModal();
            },
          },
          _("Cancel"),
        ),
        E(
          "button",
          {
            type: "button",
            class: "pq-btn pq-btn--danger",
            click: (ev) => {
              ev.preventDefault();
              ui.hideModal();
              onConfirm();
            },
          },
          actionText,
        ),
      ]),
    ],
    "pq-modal",
  );
}

function createHome({ onDiagnostics }) {
  const state = {
    // service
    running: null,
    enabled: null,
    pending: null,
    // subscription
    urls: subscriptionUrls(),
    infos: [],
    infoLoaded: false,
    refreshing: false,
    // servers
    groups: null,
    pings: {},
    choosing: null,
    // router
    board: null,
    memory: null,
    cpu: null,
    cpuPrev: null,
    // versions
    versions: null,
  };

  const subscriptionSlot = E("div", { class: "pq-stack" });
  const routerSlot = E("div");
  const ipv6Setting = lanIPv6.render(notice);
  const vpnSlot = E("div", { class: "pq-stack" });
  const updatesDot = E("span", { class: "pq-pill__dot", hidden: "" });

  // ── header ──────────────────────────────────────────────

  function pill(iconName, label, onClick, extra = []) {
    return E(
      "button",
      {
        type: "button",
        class: "pq-pill",
        "aria-label": label,
        title: label,
        click: (ev) => {
          ev.preventDefault();
          onClick();
        },
      },
      [icon(iconName, 20), E("span", { class: "pq-pill__label" }, label), ...extra],
    );
  }

  function openUpdates(kind) {
    const versions = state.versions || {
      variant: "stock",
      outdated: { app: false, core: false },
    };

    control.openUpdates(kind, versions, () => {
      loadVersions();
      refreshStatus();
    });
  }

  const header = E("div", { class: "pq-head", role: "banner" }, [
    E(
      "a",
      {
        class: "pq-pill pq-pill--logo",
        href: "#",
        "aria-label": "PostQ VPN",
        click: (ev) => {
          ev.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
      },
      [E("span", { class: "pq-logo" })],
    ),
    E("div", { class: "pq-head__spacer" }),
    pill(
      "download",
      _("Updates"),
      () => {
        const outdated = state.versions ? state.versions.outdated : {};

        openUpdates(!outdated.app && outdated.core ? "core" : "app");
      },
      [updatesDot],
    ),
    pill("activity", _("Diagnostics"), () => onDiagnostics()),
    E(
      "a",
      {
        class: "pq-pill pq-pill--icon",
        href: L.url("admin/status/overview"),
        "aria-label": _("Router settings"),
        title: _("Router settings (OpenWrt)"),
      },
      [icon("router", 20)],
    ),
    E(
      "a",
      {
        class: "pq-pill pq-pill--icon",
        href: L.url("admin/logout"),
        "aria-label": _("Log out"),
        title: _("Log out"),
      },
      [icon("logout", 20)],
    ),
  ]);

  // ── subscription ────────────────────────────────────────

  function infoFor(url, index) {
    const wanted = withoutFragment(url);

    return (
      state.infos.find((item) => withoutFragment(item.url) === wanted) ||
      (state.infos.length === state.urls.length ? state.infos[index] : null) ||
      (state.urls.length === 1 ? state.infos[0] : null) ||
      null
    );
  }

  function links() {
    return E("div", { class: "pq-links" }, [
      E(
        "a",
        {
          class: "pq-btn-tile pq-btn-tile--muted pq-btn-tile--link",
          href: CABINET_URL,
          target: "_blank",
          rel: "noopener noreferrer",
        },
        [_("Personal account"), icon("arrow", 18, "pq-caption")],
      ),
      dropdown(
        E(
          "button",
          {
            type: "button",
            class: "pq-btn-tile pq-btn-tile--muted pq-btn-tile--link pq-chevron-btn",
          },
          [_("Support"), icon("chevron", 18, "pq-caption pq-chevron")],
        ),
        [
          {
            title: _("In the personal account"),
            subtitle: _("Chat on web.postq.space"),
            href: CABINET_SUPPORT_URL,
          },
          {
            title: _("In Telegram"),
            subtitle: "@postq_vpn_support_bot",
            href: SUPPORT_BOT_URL,
          },
        ],
      ),
    ]);
  }

  async function refreshSubscriptions() {
    if (state.refreshing) {
      return;
    }

    state.refreshing = true;
    renderSubscription();
    try {
      const result = await main.PostQShellMethods.refreshAllSubscriptions();

      ui.addNotification(
        null,
        E("p", [
          result && result.success
            ? _("Subscription updated")
            : (result && result.message) || _("Failed to update subscription"),
        ]),
        result && result.success ? "info" : "warning",
      );
    } catch (e) {
      ui.addNotification(
        null,
        E("p", [_("Failed to update subscription")]),
        "warning",
      );
    } finally {
      state.refreshing = false;
      await Promise.all([loadInfo(), loadServers()]);
    }
  }

  function subscriptionCard(url, index) {
    const info = infoFor(url, index);
    const now = Math.floor(Date.now() / 1000);
    const line = info ? main.describeSubscriptionInfo(info, now) : null;
    const expired = Boolean(line && line.daysLeft !== null && line.daysLeft <= 0);
    const soon = Boolean(line && !expired && line.expiresSoon);
    const daysText = (n) => `${n} ${plural(n, _("day|days|days"))}`;
    let term = _("Waiting for the panel's answer");

    if (line && info.expire) {
      term = expired
        ? _("Ended on %s").format(formatDate(info.expire))
        : _("Until %s · %s left").format(formatDate(info.expire), daysText(line.daysLeft));
    } else if (line && line.noExpiry) {
      term = _("No end date");
    } else if (info && info.title) {
      term = info.title;
    } else if (state.infoLoaded) {
      term = hostOf(url);
    }

    const menuItems = [
      {
        title: _("Change"),
        subtitle: _("Another link for this subscription"),
        action: () =>
          linkDialog(_("Subscription link"), url, _("Save"), (next) => {
            const list = state.urls.slice();

            list[index] = next;
            applyUrls(list);
          }),
      },
      {
        title: _("Add another"),
        subtitle: _("Servers of one more subscription"),
        action: () =>
          linkDialog(_("New subscription"), "", _("Add"), (next) =>
            applyUrls(state.urls.concat([next])),
          ),
      },
      {
        title: _("Delete"),
        subtitle: _("The VPN stops working"),
        danger: true,
        action: () =>
          confirmDialog(
            _("Delete the subscription?"),
            state.urls.length > 1
              ? _("Its servers disappear from the list.")
              : _("The VPN stops until a subscription is added."),
            _("Delete"),
            () => applyUrls(state.urls.filter((_item, i) => i !== index)),
          ),
      },
    ];

    const used = line ? line.used : null;
    const total = line ? line.total : null;
    let traffic = "—";

    if (total !== null && used !== null) {
      traffic = _("%s of %s").format(formatBytes(used), formatBytes(total));
    } else if (used !== null) {
      traffic = formatBytes(used);
    }

    const title = !line || (!info.expire && !line.noExpiry && used === null)
      ? _("Subscription")
      : expired
        ? _("Subscription ended")
        : _("Subscription active");

    return E("section", { class: "pq-card pq-card--sub" }, [
      E("div", { class: "pq-row pq-row--top" }, [
        E("div", { class: "pq-titles" }, [
          E("h2", { class: "pq-title" }, title),
          E(
            "p",
            {
              class: `pq-body ${expired ? "pq-text-error" : soon ? "pq-text-warn" : "pq-caption"}`,
            },
            term,
          ),
        ]),
        dropdown(
          E(
            "button",
            {
              type: "button",
              class: "pq-icon-btn",
              "aria-label": _("Manage the subscription"),
              title: _("Manage the subscription"),
            },
            [icon("dots", 20)],
          ),
          menuItems,
        ),
      ]),
      expired || soon
        ? E("div", { class: "pq-stack pq-stack--group" }, [
            expired
              ? notice(
                  "error",
                  _("The VPN stopped working"),
                  _("Renew the subscription in the personal account, then update it here."),
                )
              : notice(
                  "warning",
                  _("Ends soon"),
                  _("Renew the subscription in the personal account so the VPN does not turn off."),
                ),
          ])
        : "",
      statTile(
        _("Traffic"),
        traffic,
        total !== null
          ? progress(line.percent, _("Traffic"))
          : E("div", { class: "pq-tile__end" }, [
              infinityMark(),
              E("span", { class: "pq-sr" }, _("Unlimited")),
            ]),
      ),
      E("div", { class: "pq-stack pq-stack--item" }, [
        E(
          "button",
          {
            type: "button",
            class: "pq-btn-tile",
            disabled: state.refreshing ? "" : null,
            click: (ev) => {
              ev.preventDefault();
              refreshSubscriptions();
            },
          },
          state.refreshing
            ? [spinner(), _("Updating the subscription…")]
            : [_("Update the subscription")],
        ),
        links(),
      ]),
    ]);
  }

  function emptySubscriptionCard() {
    const input = E("input", {
      type: "url",
      class: "pq-input",
      placeholder: _("Paste the subscription link https://…"),
      "aria-label": _("Subscription link"),
      required: "",
    });
    const error = E("p", { class: "pq-field-error" });

    return E("section", { class: "pq-card pq-card--sub" }, [
      E("div", { class: "pq-titles pq-titles--item" }, [
        E("h2", { class: "pq-title" }, _("Connect PostQ VPN")),
        E(
          "p",
          { class: "pq-body pq-text" },
          _("Copy the subscription link in the personal account and paste it here. The VPN starts working on every device at home."),
        ),
      ]),
      E(
        "form",
        {
          class: "pq-stack pq-stack--item",
          submit: (ev) => {
            ev.preventDefault();

            const url = input.value.trim();
            const check = main.validateUrl(url);

            if (!check.valid) {
              error.textContent = check.message;
              return;
            }

            applyUrls([url]);
          },
        },
        [
          input,
          error,
          E("button", { type: "submit", class: "pq-btn" }, _("Connect")),
          E(
            "a",
            {
              class: "pq-btn-tile pq-btn-tile--muted pq-btn-tile--link",
              href: CABINET_URL,
              target: "_blank",
              rel: "noopener noreferrer",
            },
            [_("Personal account"), icon("arrow", 18, "pq-caption")],
          ),
        ],
      ),
    ]);
  }

  function renderSubscription() {
    if (!state.urls.length) {
      subscriptionSlot.replaceChildren(emptySubscriptionCard());
      return;
    }

    subscriptionSlot.replaceChildren(...state.urls.map(subscriptionCard));
  }

  async function loadInfo() {
    if (!state.urls.length) {
      return;
    }

    const info = await main.PostQShellMethods.getSubscriptionInfo().catch(
      () => null,
    );
    const all = main.parseSubscriptionInfo(info && info.success ? info.data : {});

    state.infos = all[SECTION] || [];
    state.infoLoaded = true;
    // the page must not redraw a menu that is open
    if (!subscriptionSlot.querySelector(".pq-menu:not([hidden])")) {
      renderSubscription();
    }
  }

  // ── router ──────────────────────────────────────────────

  function routerRow(label, value, percent) {
    return E("div", { class: "pq-stack pq-stack--item" }, [
      E("div", { class: "pq-row pq-row--baseline" }, [
        E("dt", { class: "pq-body pq-text" }, label),
        E("dd", { class: "pq-body pq-strong" }, value),
      ]),
      progress(percent, label),
    ]);
  }

  function coreRow() {
    const versions = state.versions;

    if (!versions || !versions.coreVersion) {
      return "";
    }

    const version = versions.coreVersion;
    const old = !coreMeetsMinimum(version);
    const stock = !String(version).includes("-extended-");

    return E("div", { class: "pq-core" }, [
      E("div", { class: "pq-row pq-row--top" }, [
        E("div", { class: "pq-titles" }, [
          E("span", { class: "pq-body pq-heading" }, _("sing-box core")),
          E("span", { class: `pq-meta${old ? " pq-text-warn" : ""}` }, [
            stock
              ? _("%s (stock): servers with XHTTP do not work").format(version)
              : old
                ? _("%s is older than %s: servers with XHTTP do not work").format(
                    version,
                    CORE_MIN_VERSION,
                  )
                : version,
          ]),
        ]),
        E(
          "button",
          {
            type: "button",
            class: "pq-link-action",
            click: (ev) => {
              ev.preventDefault();
              openUpdates("core");
            },
          },
          old || versions.outdated.core ? _("Update") : _("Change build"),
        ),
      ]),
    ]);
  }

  function renderRouter() {
    const board = state.board || {};
    const memory = state.memory;
    const release = board.release || {};
    const memUsed = memory ? memory.total - (memory.available || memory.free) : 0;
    const memPercent = memory && memory.total ? (memUsed / memory.total) * 100 : 0;
    const mb = (bytes) => Math.round(bytes / 1048576);

    routerSlot.replaceChildren(
      E("section", { class: "pq-card pq-card--router" }, [
        E("div", { class: "pq-titles" }, [
          E("h2", { class: "pq-section" }, board.model || _("Router")),
          release.version
            ? E("p", { class: "pq-meta" }, [
                _("Firmware %s").format(
                  `${release.distribution || "OpenWrt"} ${release.version}`,
                ),
              ])
            : "",
        ]),
        E("dl", { class: "pq-stack pq-stack--group pq-dl" }, [
          routerRow(
            _("Processor"),
            state.cpu !== null ? `${Math.round(state.cpu)}%` : "—",
            state.cpu || 0,
          ),
          routerRow(
            _("Memory"),
            memory ? _("%d of %d MB").format(mb(memUsed), mb(memory.total)) : "—",
            memPercent,
          ),
        ]),
        coreRow(),
        ipv6Setting,
      ]),
    );
  }

  async function loadRouter() {
    const [board, info, stat] = await Promise.all([
      state.board ? Promise.resolve(state.board) : callBoard().catch(() => null),
      callInfo().catch(() => null),
      fs.read("/proc/stat").catch(() => null),
    ]);

    state.board = board;
    state.memory = info && info.memory ? info.memory : null;

    // the processor: the busy share of the time since the last reading
    const first = stat ? String(stat).split("\n")[0] : "";

    if (first.startsWith("cpu ")) {
      const fields = first.trim().split(/\s+/).slice(1).map(Number);
      const idle = (fields[3] || 0) + (fields[4] || 0);
      const total = fields.reduce((sum, n) => sum + (n || 0), 0);

      if (state.cpuPrev && total > state.cpuPrev.total) {
        state.cpu =
          100 * (1 - (idle - state.cpuPrev.idle) / (total - state.cpuPrev.total));
      }
      state.cpuPrev = { idle, total };
    }

    renderRouter();
  }

  async function loadVersions() {
    state.versions = await control.loadVersions().catch(() => null);

    const outdated = state.versions && state.versions.outdated;
    const old =
      state.versions &&
      state.versions.coreVersion &&
      !coreMeetsMinimum(state.versions.coreVersion);

    updatesDot.hidden = !(outdated && (outdated.app || outdated.core)) && !old;
    renderRouter();
  }

  // ── VPN ─────────────────────────────────────────────────

  // The group of the subscription section, as the dashboard builds it.
  function mainGroup() {
    return (state.groups || []).find(
      (group) => group.displayName === SECTION || group.code === `${SECTION}-out`,
    );
  }

  // The lists to choose from: the section's own one and, with several
  // subscriptions, one per subscription (its Auto first).
  function pickers() {
    const group = mainGroup();

    if (!group) {
      return [];
    }

    const lists = [];
    const top = group.outbounds || [];

    if (top.length) {
      lists.push({ title: null, outbounds: top });
    }
    (group.subgroups || []).forEach((sub) =>
      lists.push({ title: sub.displayName, outbounds: sub.outbounds || [] }),
    );

    return lists.map((list) => ({ ...list, selector: group.code }));
  }

  function nameOf(outbound) {
    const name = outbound.displayName || outbound.code;

    return name === _("Fastest") || /^⚡/.test(name) ? _("Auto") : name;
  }

  function currentRoute() {
    const lists = pickers();

    for (const list of lists) {
      const selected = list.outbounds.find((item) => item.selected);

      if (!selected) {
        continue;
      }

      if (isGroup(selected)) {
        return selected.current
          ? _("Auto, now %s").format(splitServerName(selected.current).main)
          : _("Auto: the fastest working server");
      }

      return _("via %s").format(splitServerName(nameOf(selected)).main);
    }

    return null;
  }

  function pingNode(outbound) {
    const ping = state.pings[outbound.code];

    if (ping && ping.loading) {
      return spinner("pq-spinner--sm");
    }

    const ms = ping ? ping.ms : outbound.latency;

    if (ping && !ping.ms) {
      return E("span", { class: "pq-meta pq-text-error pq-ping" }, _("no answer"));
    }
    if (!ms) {
      return "";
    }

    return E(
      "span",
      { class: `pq-meta pq-ping${ms >= SLOW_PING_MS ? " pq-text-warn" : ""}` },
      _("%d ms").format(ms),
    );
  }

  async function choose(selector, outbound) {
    if (state.choosing || outbound.selected) {
      return;
    }

    state.choosing = outbound.code;
    // at once on the screen; the answer of sing-box puts it right
    (state.groups || []).forEach((group) => {
      [group, ...(group.subgroups || [])].forEach((list) =>
        (list.outbounds || []).forEach((item) => {
          item.selected = item.code === outbound.code;
        }),
      );
    });
    renderVpn();
    try {
      await main.PostQShellMethods.setClashApiGroupProxy(selector, outbound.code);
    } finally {
      state.choosing = null;
      await loadServers();
    }
  }

  async function pingAll() {
    const codes = [];

    pickers().forEach((list) =>
      list.outbounds.forEach((item) => {
        if (!codes.includes(item.code)) {
          codes.push(item.code);
        }
      }),
    );
    codes.forEach((code) => (state.pings[code] = { loading: true }));
    renderVpn();

    let next = 0;

    async function worker() {
      while (next < codes.length) {
        const code = codes[next++];
        const ms = await main.PostQShellMethods.getClashApiProxyLatency(code)
          .then((response) => (response.success && response.data && response.data.delay) || 0)
          .catch(() => 0);

        state.pings[code] = { ms };
        renderVpn();
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(PING_CONCURRENCY, codes.length) }, worker),
    );
    await loadServers();
  }

  function serverButton(list, outbound, wide) {
    const { main: name, note } = splitServerName(nameOf(outbound));
    const busy = Boolean(state.choosing);

    if (isGroup(outbound)) {
      return E(
        "button",
        {
          type: "button",
          role: "radio",
          class: "pq-server pq-server--auto",
          "aria-checked": String(Boolean(outbound.selected)),
          disabled: busy ? "" : null,
          click: (ev) => {
            ev.preventDefault();
            choose(list.selector, outbound);
          },
        },
        [
          E("span", { class: "pq-server__text" }, [
            E("span", { class: "pq-body pq-strong" }, name),
            E(
              "span",
              { class: "pq-meta pq-truncate" },
              outbound.current
                ? _("now %s").format(splitServerName(outbound.current).main)
                : _("the fastest of the working ones"),
            ),
          ]),
          pingNode(outbound),
          outbound.selected ? icon("check", 20, "pq-accent") : "",
        ],
      );
    }

    return E(
      "button",
      {
        type: "button",
        role: "radio",
        class: `pq-server${wide ? " pq-server--wide" : ""}`,
        "aria-checked": String(Boolean(outbound.selected)),
        disabled: busy ? "" : null,
        click: (ev) => {
          ev.preventDefault();
          choose(list.selector, outbound);
        },
      },
      [
        E("span", { class: "pq-body pq-server__name pq-truncate" }, [
          name,
          note ? E("span", { class: "pq-server__note" }, note) : "",
        ]),
        pingNode(outbound),
        outbound.selected ? icon("check", 20, "pq-accent") : "",
      ],
    );
  }

  function serverPicker(list, withTitle) {
    const groups = list.outbounds.filter(isGroup);
    const servers = list.outbounds.filter((item) => !isGroup(item));
    let russian = servers.filter(isRussian);

    // nothing but Russian servers: no "slower" line
    if (russian.length === servers.length) {
      russian = [];
    }

    const regular = servers.filter((item) => !russian.includes(item));
    const anyPinging = Object.values(state.pings).some((p) => p.loading);
    const items = [
      ...groups.map((item) => serverButton(list, item, true)),
      ...regular.map((item) => serverButton(list, item, false)),
    ];

    if (russian.length) {
      items.push(
        E(
          "p",
          { class: "pq-meta pq-grid-note" },
          _("Slower than the others: choose them only if the others do not work"),
        ),
        ...russian.map((item) => serverButton(list, item, false)),
      );
    }

    return E("div", { class: "pq-stack pq-stack--group" }, [
      E("div", { class: "pq-row" }, [
        E("h3", { class: "pq-section" }, [
          withTitle && list.title
            ? _("Server · %s").format(list.title)
            : _("Server"),
          state.choosing ? spinner("pq-spinner--sm") : "",
        ]),
        servers.length
          ? E(
              "button",
              {
                type: "button",
                class: "pq-link-action",
                disabled: anyPinging ? "" : null,
                click: (ev) => {
                  ev.preventDefault();
                  pingAll();
                },
              },
              anyPinging ? _("Checking the ping…") : _("Check the ping"),
            )
          : "",
      ]),
      E(
        "div",
        { class: "pq-servers", role: "radiogroup", "aria-label": _("VPN server") },
        items,
      ),
    ]);
  }

  async function serviceAction(action) {
    state.pending = action === "start" ? _("Turning on…") : action === "stop" ? _("Turning off…") : _("Restarting…");
    renderVpn();
    try {
      await main.PostQShellMethods[action]();
    } catch (e) {
      ui.addNotification(null, E("p", [String(e)]), "warning");
    }
    // sing-box takes a moment to answer after the start
    for (let i = 0; i < 6; i++) {
      await refreshStatus(true);
      if ((action === "stop") !== Boolean(state.running)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    state.pending = null;
    renderVpn();
    loadServers();
  }

  function powerButton() {
    const on = Boolean(state.running);
    const label = on ? _("Turn the VPN off") : _("Turn the VPN on");

    return E(
      "button",
      {
        type: "button",
        class: "pq-power",
        "aria-pressed": String(on),
        "aria-label": label,
        title: label,
        disabled: state.pending || state.running === null ? "" : null,
        click: (ev) => {
          ev.preventDefault();
          serviceAction(on ? "stop" : "start");
        },
      },
      [
        E("span", { class: "pq-sonar", "aria-hidden": "true" }, [E("span")]),
        state.pending
          ? spinner("pq-spinner--lg")
          : E("span", { class: "pq-power__icons" }, [
              icon("power", 30, "pq-power__off"),
              mark(30, "pq-power__on"),
            ]),
      ],
    );
  }

  function renderVpn() {
    const lists = pickers();
    const title = state.pending
      ? state.pending
      : state.running === null
        ? _("Checking…")
        : state.running
          ? _("VPN is on")
          : _("VPN is off");
    let caption;

    if (state.pending) {
      caption = _("This takes a few seconds");
    } else if (state.running === null) {
      caption = "";
    } else if (!state.running) {
      caption = state.urls.length
        ? _("Devices go to the internet directly")
        : _("No subscription: there are no servers yet");
    } else {
      caption = currentRoute() || _("Sites from the lists go through the VPN");
    }

    const dataState = state.pending ? "pending" : state.running ? "running" : "stopped";
    let body;

    if (!state.urls.length) {
      body = E("div", { class: "pq-empty" }, [
        E("p", { class: "pq-body pq-text" }, _("The servers appear once you add a subscription.")),
      ]);
    } else if (state.running && state.groups === null) {
      body = E("div", { class: "pq-stack pq-stack--group" }, [
        E("div", { class: "pq-skel pq-skel--title" }),
        E(
          "div",
          { class: "pq-servers" },
          Array.from({ length: 6 }, () => E("div", { class: "pq-skel pq-skel--server" })),
        ),
      ]);
    } else if (!state.running) {
      body = E("div", { class: "pq-empty" }, [
        E("p", { class: "pq-body pq-text" }, _("Turn the VPN on to choose a server.")),
      ]);
    } else if (!lists.length) {
      body = E("div", { class: "pq-empty" }, [
        E("p", { class: "pq-body pq-text" }, _("The list of servers has not been received yet: update the subscription.")),
      ]);
    } else {
      body = E(
        "div",
        { class: "pq-stack pq-stack--card" },
        lists.map((list) => serverPicker(list, lists.length > 1)),
      );
    }

    const logBtn = E(
      "button",
      {
        type: "button",
        class: "pq-btn-tile pq-btn-tile--muted",
        title: _("The PostQ VPN and sing-box log in one file"),
        click: async (ev) => {
          ev.preventDefault();
          logBtn.disabled = true;
          logBtn.replaceChildren(spinner(), _("Preparing..."));
          await control.downloadLog().catch(() => false);
          logBtn.disabled = false;
          logBtn.replaceChildren(icon("download", 20), _("Download the log for support"));
        },
      },
      [icon("download", 20), _("Download the log for support")],
    );

    vpnSlot.replaceChildren(
      E("section", { class: "pq-card pq-vpn", "data-state": dataState }, [
        E("div", { class: "pq-row pq-row--center" }, [
          E("div", { class: "pq-titles" }, [
            E("h2", { class: "pq-title", "aria-live": "polite" }, title),
            E("p", { class: "pq-meta pq-truncate" }, caption),
          ]),
          E("div", { class: "pq-vpn__actions" }, [
            state.running && !state.pending
              ? E(
                  "button",
                  {
                    type: "button",
                    class: "pq-icon-btn",
                    "aria-label": _("Restart the VPN"),
                    title: _("Restart the VPN"),
                    click: (ev) => {
                      ev.preventDefault();
                      serviceAction("restart");
                    },
                  },
                  [icon("refresh", 20)],
                )
              : "",
            powerButton(),
          ]),
        ]),
        body,
        logBtn,
      ]),
    );
  }

  async function refreshStatus(quiet) {
    const [service, singBox] = await Promise.all([
      main.PostQShellMethods.getStatus().catch(() => null),
      main.PostQShellMethods.getSingBoxStatus().catch(() => null),
    ]);
    const running = Boolean(
      singBox && singBox.success && singBox.data && singBox.data.running,
    );
    const changed = running !== state.running;

    state.running = running;
    state.enabled = Boolean(
      service && service.success && service.data && service.data.enabled,
    );
    if (!running) {
      state.groups = null;
    }
    if (!quiet && changed && !state.pending) {
      renderVpn();
      if (running) {
        loadServers();
      }
    }
  }

  async function loadServers() {
    if (!state.running || !state.urls.length) {
      renderVpn();
      return;
    }

    const result = await main.CustomPostQMethods.getDashboardSections().catch(
      () => null,
    );

    if (result && result.success) {
      state.groups = result.data;
    }
    // a choice in flight keeps its picture until sing-box answers
    if (!state.choosing) {
      renderVpn();
    }
  }

  // ── layout ──────────────────────────────────────────────

  const node = E("div", { class: "pq-home" }, [
    E("div", { class: "pq-grid" }, [
      E("div", { class: "pq-col pq-col--side" }, [subscriptionSlot, routerSlot]),
      E("div", { class: "pq-col pq-col--main" }, [vpnSlot]),
    ]),
  ]);

  renderSubscription();
  renderRouter();
  renderVpn();

  refreshStatus(true).then(() => {
    renderVpn();
    loadServers();
  });
  loadInfo();
  loadRouter();
  loadVersions();

  function every(ms, fn) {
    const timer = setInterval(() => {
      if (!document.body.contains(node)) {
        clearInterval(timer);
        return;
      }
      if (!document.hidden && node.offsetParent) {
        fn();
      }
    }, ms);
  }

  every(STATUS_INTERVAL, () => {
    if (!state.pending) {
      refreshStatus();
    }
  });
  every(SERVERS_INTERVAL, () => {
    if (!state.pending && !state.choosing && !Object.values(state.pings).some((p) => p.loading)) {
      loadServers();
    }
  });
  every(INFO_INTERVAL, loadInfo);
  every(ROUTER_INTERVAL, loadRouter);

  return { header, node };
}

return baseclass.extend({
  createHome,
});
