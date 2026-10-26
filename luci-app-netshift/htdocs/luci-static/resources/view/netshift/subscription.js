"use strict";
"require baseclass";
"require form";
"require uci";
"require ui";
"require view.netshift.main as main";

// PostQ: the "Subscription and servers" card, like the PostQ XKeen panel. One
// line per subscription over the server list: its name, refresh / edit /
// delete, and what the panel says about it (term, traffic, servers, when it was
// last updated). The address itself is shown only while it is edited. A change
// is saved and applied at once (the same apply as "Save & Apply"), so the page
// needs no form buttons. Refresh and ping press the dashboard's own buttons,
// which keep their own state and messages.

const INFO_INTERVAL = 30000;
const SECTION = "main";

const ICONS = {
  refresh:
    '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  edit: '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash:
    '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
  plus: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

function iconButton(name, label, onClick) {
  const btn = E("button", {
    type: "button",
    class: "pq-icon-btn",
    title: label,
    "aria-label": label,
    click: (ev) => {
      ev.preventDefault();
      onClick(btn);
    },
  });

  btn.innerHTML = ICONS[name];

  return btn;
}

function subscriptionUrls() {
  const value = uci.get("netshift", SECTION, "subscription_url");

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return value ? [value] : [];
}

// Saves the list of subscriptions and applies it (NetShift restarts with it).
async function applyUrls(urls) {
  if (urls.length) {
    uci.set("netshift", SECTION, "subscription_url", urls);
  } else {
    uci.unset("netshift", SECTION, "subscription_url");
  }

  await uci.save();
  ui.changes.apply(true);
}

const withoutFragment = (url) => String(url || "").split("#")[0];

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function agoText(seconds) {
  if (seconds < 60) {
    return _("updated just now");
  }
  if (seconds < 3600) {
    return _("updated %d min ago").format(Math.floor(seconds / 60));
  }
  if (seconds < 86400) {
    return _("updated %d h ago").format(Math.floor(seconds / 3600));
  }

  return _("updated %d d ago").format(Math.floor(seconds / 86400));
}

// The line of what the panel reports about one subscription.
function infoParts(info, servers) {
  const now = Math.floor(Date.now() / 1000);
  const lang = document.documentElement.lang || "";
  const parts = [];
  let soon = false;

  if (info) {
    const line = main.describeSubscriptionInfo(info, now);

    if (line.daysLeft !== null && line.daysLeft >= 0) {
      parts.push(
        `${_("Subscription ends in")}: ${line.daysLeft} ${main.pluralForm(line.daysLeft, _("day|days|days"), lang)}`,
      );
      soon = line.expiresSoon;
    } else if (line.daysLeft !== null) {
      parts.push(`${_("Expired")}: ${line.expireDate}`);
      soon = true;
    } else if (line.noExpiry) {
      parts.push(_("Unlimited subscription"));
    }

    if (line.used !== null) {
      parts.push(
        line.total !== null
          ? `${_("traffic")} ${main.prettyBytes(line.used)} / ${main.prettyBytes(line.total)}`
          : `${_("traffic")} ${main.prettyBytes(line.used)}`,
      );
    }
  }

  if (servers > 0) {
    parts.push(
      `${servers} ${main.pluralForm(servers, _("server|servers|servers"), lang)}`,
    );
  }

  if (info && info.updated > 0) {
    parts.push(agoText(Math.max(0, now - info.updated)));
  }

  return { text: parts.join(" · "), soon };
}

function renderCard() {
  const node = E("div", { class: "pq-sub" });
  const urls = subscriptionUrls();
  let editing = null; // index of the line being edited, or "new"
  let infos = [];
  let servers = 0;

  function pressDashboard(selector) {
    const btn = document.querySelector(selector);

    if (btn) {
      btn.click();
    }

    return Boolean(btn);
  }

  async function loadInfo() {
    const [info, proxies] = await Promise.all([
      main.NetShiftShellMethods.getSubscriptionInfo().catch(() => null),
      main.NetShiftShellMethods.getClashApiProxies().catch(() => null),
    ]);
    const all = main.parseSubscriptionInfo(
      info && info.success ? info.data : {},
    );

    infos = all[SECTION] || [];

    const list =
      proxies && proxies.success && proxies.data && proxies.data.proxies;
    const selector = list && list[`${SECTION}-out`];

    servers = selector
      ? (selector.all || []).filter((tag) => {
          const type = String(
            (list[tag] && list[tag].type) || "",
          ).toLowerCase();

          return type !== "urltest" && type !== "selector";
        }).length
      : 0;
    draw();
  }

  function infoFor(url, index) {
    const wanted = withoutFragment(url);

    return (
      infos.find((item) => withoutFragment(item.url) === wanted) ||
      (infos.length === urls.length ? infos[index] : null) ||
      (urls.length === 1 ? infos[0] : null) ||
      null
    );
  }

  function urlForm(value, submitText, onSubmit, onCancel) {
    const input = E("input", {
      type: "url",
      class: "pq-sub__input",
      value: value || "",
      placeholder: _("Paste the subscription link https://…"),
      "aria-label": _("Subscription link"),
      required: "",
    });
    const error = E("div", { class: "pq-sub__error" });
    const form = E(
      "form",
      {
        class: "pq-sub__form",
        submit: (ev) => {
          ev.preventDefault();

          const url = input.value.trim();
          const check = main.validateUrl(url);

          if (!check.valid) {
            error.textContent = check.message;
            return;
          }

          onSubmit(url);
        },
      },
      [
        input,
        E(
          "button",
          { type: "submit", class: "btn cbi-button pq-sub__submit" },
          submitText,
        ),
        onCancel
          ? E(
              "button",
              {
                type: "button",
                class: "btn cbi-button",
                click: (ev) => {
                  ev.preventDefault();
                  onCancel();
                },
              },
              _("Cancel"),
            )
          : "",
      ],
    );

    setTimeout(() => input.focus(), 0);

    return E("div", { class: "pq-sub__form-wrap" }, [form, error]);
  }

  function lineFor(url, index) {
    if (editing === index) {
      return E("div", { class: "pq-sub__row pq-sub__row--edit" }, [
        urlForm(
          url,
          _("Save"),
          (next) => {
            const list = urls.slice();

            list[index] = next;
            applyUrls(list);
          },
          () => {
            editing = null;
            draw();
          },
        ),
      ]);
    }

    const info = infoFor(url, index);
    const { text, soon } = infoParts(info, urls.length === 1 ? servers : 0);
    const title = (info && info.title) || hostOf(url);

    return E("div", { class: "pq-sub__row" }, [
      E("b", { class: "pq-sub__name" }, title),
      iconButton("refresh", _("Refresh subscription"), (btn) => {
        btn.disabled = true;
        if (
          !pressDashboard(".dashboard-sections-grid-item-refresh-subscription")
        ) {
          main.NetShiftShellMethods.refreshAllSubscriptions().finally(() =>
            loadInfo(),
          );
        }
        setTimeout(() => {
          btn.disabled = false;
          loadInfo();
        }, 8000);
      }),
      iconButton("edit", _("Change the link"), () => {
        editing = index;
        draw();
      }),
      iconButton("trash", _("Delete subscription"), () => {
        if (
          confirm(
            (urls.length > 1
              ? _("Delete the subscription «%s»?")
              : _(
                  "Delete the subscription «%s»? The VPN stops until a subscription is added.",
                )
            ).format(title),
          )
        ) {
          applyUrls(urls.filter((_item, i) => i !== index));
        }
      }),
      E(
        "span",
        { class: `pq-sub__info${soon ? " pq-sub__info--soon" : ""}` },
        text,
      ),
      index === 0
        ? E(
            "button",
            {
              type: "button",
              class: "pq-sub__ping",
              click: (ev) => {
                ev.preventDefault();
                pressDashboard(".dashboard-sections-grid-item-test-latency");
              },
            },
            [E("span", { class: "pq-sub__ping-icon" }), _("Ping servers")],
          )
        : "",
    ]);
  }

  function draw() {
    const head = E("div", { class: "pq-sub__head" }, [
      E("h3", {}, _("Subscription and servers")),
      urls.length
        ? iconButton("plus", _("Add subscription"), () => {
            editing = "new";
            draw();
          })
        : "",
    ]);

    const children = [head];

    if (!urls.length) {
      children.push(
        urlForm("", _("Connect"), (url) => applyUrls([url]), null),
        E(
          "p",
          { class: "pq-sub__hint" },
          _("The servers appear here a few seconds after connecting."),
        ),
      );
    } else {
      const rows = urls.map((url, index) => lineFor(url, index));

      if (editing === "new") {
        rows.push(
          E("div", { class: "pq-sub__row pq-sub__row--edit" }, [
            urlForm(
              "",
              _("Add"),
              (url) => applyUrls(urls.concat([url])),
              () => {
                editing = null;
                draw();
              },
            ),
          ]),
        );
      }
      children.push(E("div", { class: "pq-sub__list" }, rows));
    }

    node.replaceChildren(...children);
    node.querySelectorAll(".pq-sub__ping-icon").forEach((el) => {
      el.innerHTML = ICONS.refresh;
    });
  }

  draw();
  if (urls.length) {
    loadInfo();
    const timer = setInterval(() => {
      if (!document.body.contains(node)) {
        clearInterval(timer);
        return;
      }
      if (!document.hidden && node.offsetParent && editing === null) {
        loadInfo();
      }
    }, INFO_INTERVAL);
  }

  return node;
}

// The card and the server list under it (the dashboard), as one block.
function createSubscriptionContent(section) {
  const o = section.option(form.DummyValue, "_mount_node");
  o.rawhtml = true;
  o.cfgvalue = () => {
    main.DashboardTab.initController();

    return E("div", { class: "pq-servers" }, [
      renderCard(),
      main.DashboardTab.render(),
    ]);
  };
}

return baseclass.extend({
  createSubscriptionContent,
});
