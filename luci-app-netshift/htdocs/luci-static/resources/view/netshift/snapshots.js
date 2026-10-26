"use strict";
"require baseclass";
"require ui";
"require view.netshift.main as main";

// PostQ: the snapshots of the settings take a short card in the diagnostics'
// right column (how many there are, the newest one) and open in a dialog. The
// dialog holds the stock snapshots widget itself, moved there while it is open
// and put back when it closes, so restoring and saving work as they did.

function summary(snapshots) {
  if (!snapshots.length) {
    return _("No snapshots yet");
  }

  const newest = snapshots.reduce((a, b) => (b.time > a.time ? b : a));

  return `${_("Snapshots")}: ${snapshots.length} · ${_("newest")} ${main.formatSnapshotTime(newest.time)}`;
}

function mountSnapshotsCard(node) {
  const holder = node.querySelector("#pdk_diagnostic-page-snapshots");

  if (!holder || node.querySelector(".pq-snapshots-card")) {
    return;
  }

  const text = E("span", { class: "pq-snapshots-card__sub" }, _("Loading..."));

  async function refresh() {
    try {
      const response = await main.NetShiftShellMethods.listSnapshots();

      text.textContent = summary(
        response.success ? main.parseSnapshots(response.data) : [],
      );
    } catch {
      text.textContent = "";
    }
  }

  function close() {
    const widget = document.querySelector(".pq-modal .pq-snapshots-dialog > *");

    if (widget) {
      holder.appendChild(widget);
    }
    ui.hideModal();
    refresh();
  }

  function open() {
    const widget = holder.firstElementChild;

    if (!widget) {
      return;
    }

    ui.showModal(
      _("Settings snapshots"),
      [
        E("div", { class: "pq-snapshots-dialog" }, [widget]),
        E("div", { class: "pq-dns__actions" }, [
          E(
            "button",
            {
              type: "button",
              class: "btn cbi-button",
              click: (ev) => {
                ev.preventDefault();
                close();
              },
            },
            _("Close"),
          ),
        ]),
      ],
      "pq-modal",
    );
  }

  holder.classList.add("pq-snapshots-holder");
  holder.before(
    E("div", { class: "card pq-snapshots-card" }, [
      E("b", {}, _("Settings snapshots")),
      text,
      E(
        "button",
        {
          type: "button",
          class: "btn cbi-button",
          click: (ev) => {
            ev.preventDefault();
            open();
          },
        },
        _("Open snapshots"),
      ),
    ]),
  );
  refresh();
}

return baseclass.extend({
  mountSnapshotsCard,
});
