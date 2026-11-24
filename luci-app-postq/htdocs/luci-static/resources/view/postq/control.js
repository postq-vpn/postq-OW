"use strict";
"require baseclass";
"require ui";
"require view.postq.main as main";

// PostQ: what the page does besides showing the subscription and the servers.
// The updates dialog of the header (PostQ VPN and the sing-box core, like the
// "Updates" pill of the PostQ XKeen panel), the log for support and the question
// about the settings of a previous install.

function downloadText(name, text) {
  const link = E("a", {
    href: URL.createObjectURL(new Blob([text], { type: "text/plain" })),
    download: name,
  });

  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// The inline marks of the release notes: **bold**, `code` and [text](https://…)
// links. Built as nodes, never as HTML, so the notes cannot inject markup.
function inlineMarkdown(text) {
  const parts = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let m;

  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      parts.push(E("b", {}, [m[1]]));
    } else if (m[2] !== undefined) {
      parts.push(E("code", {}, [m[2]]));
    } else {
      parts.push(
        E("a", { href: m[4], target: "_blank", rel: "noopener" }, [m[3]]),
      );
    }
    last = re.lastIndex;
  }
  parts.push(text.slice(last));

  return parts.filter((p) => p !== "");
}

// The release notes of GitHub are Markdown: headings, lists, paragraphs and
// ``` code blocks are shown as such instead of the raw text.
function renderNotes(markdown) {
  const out = [];
  const lines = String(markdown).replace(/\r/g, "").split("\n");
  let list = null;
  let para = [];
  let code = null;

  function flush() {
    if (para.length) {
      out.push(E("p", {}, inlineMarkdown(para.join(" "))));
      para = [];
    }
    list = null;
  }

  for (const line of lines) {
    if (code) {
      if (/^\s*```/.test(line)) {
        out.push(E("pre", {}, [code.join("\n")]));
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const item = line.match(/^\s*[-*]\s+(.*)$/);

    if (/^\s*```/.test(line)) {
      flush();
      code = [];
    } else if (heading) {
      flush();
      out.push(E("h4", {}, inlineMarkdown(heading[2])));
    } else if (item) {
      if (para.length) {
        flush();
      }
      if (!list) {
        list = E("ul", {});
        out.push(list);
      }
      list.appendChild(E("li", {}, inlineMarkdown(item[1])));
    } else if (!line.trim()) {
      flush();
    } else if (list && /^\s+/.test(line)) {
      list.lastChild.append(" ", ...inlineMarkdown(line.trim()));
    } else {
      list = null;
      para.push(line.trim());
    }
  }
  if (code) {
    out.push(E("pre", {}, [code.join("\n")]));
  }
  flush();

  return out;
}

// Each build has its own release source and installer.
const CORE_ACTIONS = {
  extended_lite: ["check_update_lite", "install_extended_lite"],
  extended: ["check_update", "install_extended"],
  stock: ["check_update_stable", "install_stable"],
};

// The installed versions and what the daily background check (update_notice)
// found: { variant, postqVersion, coreVersion, outdated: { app, core } }.
async function loadVersions() {
  const [info, notice] = await Promise.all([
    main.PostQShellMethods.getSystemInfo().catch(() => null),
    main.PostQShellMethods.getUpdateNotice().catch(() => null),
  ]);
  const data = info && info.success && info.data ? info.data : {};
  const checks = main.parseUpdateNotice(
    notice && notice.success ? notice.data : {},
  );
  const isOutdated = (check) => Boolean(check && check.status === "outdated");

  return {
    variant: data.sing_box_variant || "stock",
    postqVersion: data.postq_version || "",
    coreVersion: data.sing_box_version || "",
    liteSupported: data.sing_box_lite_supported !== 0,
    outdated: {
      app: isOutdated(checks.postq),
      core: isOutdated(checks.sing_box),
    },
  };
}

function actionsFor(variant) {
  return CORE_ACTIONS[variant] || CORE_ACTIONS.stock;
}

// The "Updates" dialog: PostQ VPN and the sing-box core as two tabs, the
// installed and the latest version, the release notes and the install.
// `onUpdated(kind)` runs after an install that went through.
function openUpdates(kind, versions, onUpdated) {
  const body = E("div", { class: "pq-upd" });
  const tabs = E("div", { class: "pq-seg", role: "tablist" });
  let installing = false;
  let current = kind;
  let run = 0;

  const names = { stock: _("Stock"), extended_lite: "Extended Lite", extended: "Extended" };
  const installed = Object.hasOwn(CORE_ACTIONS, versions.variant) ? versions.variant : "stock";
  let selected = installed;
  const builds = E("fieldset", { class: "pq-core-builds" }, [
    E("legend", { class: "pq-upd__label" }, _("Core build")),
    E("div", { class: "pq-core-builds__options" }, Object.entries(names).map(([variant, name]) => {
      const input = E("input", { type: "radio", name: "pq-core-build", value: variant });
      input.checked = variant === selected;
      input.disabled = variant === "extended_lite" && versions.liteSupported === false;
      input.addEventListener("change", () => {
        selected = variant;
        check("core");
      });
      return E("label", {}, [input, E("span", {}, name)]);
    })),
  ]);

  function closeBtn() {
    return E(
      "button",
      {
        type: "button",
        class: "pq-btn-tile pq-btn-tile--muted",
        click: (ev) => {
          ev.preventDefault();
          if (!installing) {
            ui.hideModal();
          }
        },
      },
      _("Close"),
    );
  }

  function row(label, value) {
    return E("div", { class: "pq-upd__row" }, [
      E("span", { class: "pq-upd__label" }, label),
      E("b", {}, [value || "—"]),
    ]);
  }

  async function install(which) {
    if (which === "app") {
      return main.PostQShellMethods.postqSelfUpdate();
    }

    return main.PostQShellMethods.singBoxComponentAction(
      actionsFor(selected)[1],
    );
  }

  function show(which, result) {
    if (!result || !result.success) {
      body.replaceChildren(
        E("p", { class: "pq-upd__error" }, [
          _("Could not check for updates: %s").format(
            (result && result.message) || "?",
          ),
        ]),
        E("div", { class: "pq-upd__actions" }, [closeBtn()]),
      );
      return;
    }

    const outdated = result.status === "outdated";
    const switching = which === "core" && selected !== installed;
    const canInstall = outdated || switching || result.status === "not_installed";
    const installLabel = switching ? _("Install %s").format(names[selected]) : _("Install");
    let statusText = _("The latest version is installed");
    if (switching) statusText = _("The selected build will replace the installed core.");
    else if (canInstall) statusText = _("A new version is available");

    const installBtn = E(
      "button",
      {
        type: "button",
        class: "pq-btn",
        disabled: canInstall ? null : "",
        click: async (ev) => {
          ev.preventDefault();
          installing = true;
          builds.disabled = true;
          installBtn.disabled = true;
          tabs.querySelectorAll("button").forEach((b) => (b.disabled = true));
          installBtn.textContent = _("Updating, do not close the page...");

          const done = await install(which).catch((e) => ({
            success: false,
            message: String(e),
          }));

          installing = false;
          builds.disabled = false;
          tabs.querySelectorAll("button").forEach((b) => (b.disabled = false));
          if (!done || !done.success) {
            installBtn.disabled = false;
            installBtn.textContent = installLabel;
            ui.addNotification(
              null,
              E("p", [
                _("Update failed: %s").format((done && done.message) || "?"),
              ]),
              "warning",
            );
            return;
          }

          ui.hideModal();
          if (which === "app") {
            ui.addNotification(
              null,
              E("p", _("PostQ VPN has been updated")),
              "info",
            );
            setTimeout(() => window.location.reload(), 1500);
            return;
          }

          ui.addNotification(
            null,
            E("p", [
              _("The sing-box core has been updated to %s").format(
                done.version || result.latest_version,
              ),
            ]),
            "info",
          );
          if (onUpdated) {
            onUpdated(which);
          }
        },
      },
      installLabel,
    );

    body.replaceChildren(
      E("div", { class: "pq-upd__rows" }, [
        row(_("Installed"), which === "core" && versions.coreVersion
          ? `${names[installed]} · ${versions.coreVersion}`
          : result.current_version),
        row(_("Latest"), result.latest_version),
      ]),
      E(
        "p",
        { class: `pq-upd__status${outdated ? " pq-upd__status--new" : ""}` },
        statusText,
      ),
      result.notes
        ? E("div", { class: "pq-upd__notes" }, renderNotes(result.notes))
        : "",
      E(
        "div",
        { class: "pq-upd__actions" },
        canInstall ? [closeBtn(), installBtn] : [closeBtn()],
      ),
    );
  }

  function check(which) {
    const mine = ++run;

    current = which;
    builds.hidden = which !== "core";
    tabs.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-selected", String(b.dataset.kind === which));
    });
    body.replaceChildren(
      E("p", { class: "pq-upd__wait" }, [
        E("span", { class: "pq-spinner" }),
        _("Checking..."),
      ]),
    );

    const request =
      which === "app"
        ? main.PostQShellMethods.postqCheckUpdate()
        : main.PostQShellMethods.singBoxCheckUpdate(
            actionsFor(selected)[0],
          );

    request
      .then((result) => mine === run && show(which, result))
      .catch((e) => mine === run && show(which, { success: false, message: String(e) }));
  }

  [
    ["app", "PostQ VPN", versions.outdated.app],
    ["core", "sing-box", versions.outdated.core],
  ].forEach(([which, label, outdated]) => {
    tabs.appendChild(
      E(
        "button",
        {
          type: "button",
          role: "tab",
          "data-kind": which,
          class: outdated ? "pq-seg__dot" : "",
          click: (ev) => {
            ev.preventDefault();
            if (!installing && current !== which) {
              check(which);
            }
          },
        },
        label,
      ),
    );
  });

  ui.showModal(_("Updates"), [tabs, builds, body], "pq-modal");
  check(kind);
}

// The log for support: the same report as the diagnostics, saved as a file.
async function downloadLog() {
  const result = await main.PostQShellMethods.getSupportReport();

  if (!result.success || typeof result.data !== "string" || !result.data) {
    ui.addNotification(
      null,
      E("p", _("The report could not be prepared")),
      "warning",
    );
    return false;
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");

  downloadText(`postq-log-${stamp}.txt`, result.data);

  return true;
}

// The first install moved the subscriptions it found to the profile and kept a
// copy of the routing and DNS: asked once whether to add them.
function runBackup(command) {
  return main
    .executeShellCommand({
      command: "/usr/bin/postq",
      args: ["postq_backup", command],
    })
    .then((reply) => JSON.parse(reply.stdout || "{}"))
    .catch(() => ({}));
}

async function askAboutBackup() {
  const status = await runBackup("status");

  if (!status.pending) {
    return;
  }

  const error = E("p", { class: "pq-upd__error" });
  const keepBtn = E(
    "button",
    {
      type: "button",
      class: "pq-btn",
      click: async (ev) => {
        ev.preventDefault();
        await runBackup("dismiss");
        ui.hideModal();
      },
    },
    _("Add the PostQ routing"),
  );
  const applyBtn = E(
    "button",
    {
      type: "button",
      class: "pq-btn-tile pq-btn-tile--muted",
      click: async (ev) => {
        ev.preventDefault();
        applyBtn.disabled = true;
        keepBtn.disabled = true;
        applyBtn.textContent = _("Please wait...");

        const done = await runBackup("apply");

        if (done.ok !== true) {
          applyBtn.disabled = false;
          keepBtn.disabled = false;
          applyBtn.textContent = _("Keep the old settings");
          error.textContent = _("The saved settings could not be applied");
          return;
        }

        await main.PostQShellMethods.restart();
        window.location.reload();
      },
    },
    _("Keep the old settings"),
  );

  // One drop-down of the dialog. `compare` is the other configuration: what it
  // does not have is marked as what the button adds.
  function settingsView(title, view, compare) {
    let added = 0;

    function row(label, items, known) {
      if (!items.length) {
        return "";
      }

      return E("div", { class: "pq-backup__row" }, [
        E("b", {}, [label]),
        E(
          "ul",
          {},
          items.map((item) => {
            const isNew = compare && !known.includes(item);

            added += isNew ? 1 : 0;

            return E("li", { class: isNew ? "pq-backup__new" : "" }, [
              isNew ? `+ ${item}` : item,
            ]);
          }),
        ),
      ]);
    }

    const other = compare || view;
    const dnsNew = compare && status.dns_own;

    added += dnsNew ? 1 : 0;

    const rows = [
      E("div", { class: "pq-backup__row" }, [
        E("b", {}, ["DNS"]),
        E("ul", {}, [
          E("li", { class: dnsNew ? "pq-backup__new" : "" }, [
            `${dnsNew ? "+ " : ""}${view.dns} (bootstrap ${view.bootstrap})`,
          ]),
        ]),
      ]),
      row(
        `${_("Through the VPN")}: ${_("Lists")}`,
        view.vpn.lists,
        other.vpn.lists,
      ),
      row(
        `${_("Through the VPN")}: ${_("Domains")}`,
        view.vpn.domains,
        other.vpn.domains,
      ),
      row(
        `${_("Through the VPN")}: ${_("Subnets")}`,
        view.vpn.subnets,
        other.vpn.subnets,
      ),
      row(
        `${_("Directly")}: ${_("Domains")}`,
        view.direct.domains,
        other.direct.domains,
      ),
      row(
        `${_("Directly")}: ${_("Subnets")}`,
        view.direct.subnets,
        other.direct.subnets,
      ),
      row(_("Block and DNS rules"), view.rules, other.rules),
    ];

    return {
      added,
      node: E("details", { class: "pq-backup" }, [
        E("summary", {}, [title]),
        E("div", { class: "pq-backup__body" }, rows),
      ]),
    };
  }

  const oldView = settingsView(_("Old settings"), status.old, status.postq);
  const postqView = settingsView(_("PostQ settings"), status.postq, null);

  ui.showModal(
    _("Settings of the previous install"),
    [
      E("p", {}, _("This router had its own NetShift settings.")),
      status.subscriptions > 0
        ? E("p", {}, [
            `${_("Subscriptions moved to PostQ VPN")}: ${status.subscriptions}`,
          ])
        : "",
      E(
        "p",
        {},
        _(
          "You can add your routing and DNS to the PostQ settings. Nothing else is carried over.",
        ),
      ),
      oldView.node,
      postqView.node,
      E("p", {}, [`${_("Will be added (marked with +)")}: ${oldView.added}`]),
      error,
      E("div", { class: "pq-upd__actions" }, [applyBtn, keepBtn]),
    ],
    "pq-modal",
  );
}

// The look of the page lives in postq/postq.css, scoped to body.pq-page. Its URL
// carries the build's tag of the views and assets (put in by cache-bust.sh), so
// a changed stylesheet is fetched again even when the version stays the same.
function injectStyles() {
  document.body.classList.add("pq-page");

  if (document.getElementById("pq-page-styles")) {
    return;
  }

  document.head.appendChild(
    E("link", {
      id: "pq-page-styles",
      rel: "stylesheet",
      href: `${L.resource("postq/postq.css")}?v=__POSTQ_ASSETS_TAG__`,
    }),
  );
}

return baseclass.extend({
  askAboutBackup,
  downloadLog,
  injectStyles,
  loadVersions,
  openUpdates,
});
