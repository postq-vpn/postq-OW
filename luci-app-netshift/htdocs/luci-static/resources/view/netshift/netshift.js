"use strict";
"require view";
"require form";
"require baseclass";
"require network";
"require view.netshift.main as main";

// Dashboard content
"require view.netshift.dashboard as dashboard";

// PostQ: service status, update and log
"require view.netshift.control as control";

// PostQ simplified UI: one page with the service card, the subscription and the
// servers. The routing and DNS are fixed by /etc/uci-defaults/60_netshift-postq,
// so the settings, sections, devices, connections, component manager and
// diagnostics tabs of the full UI are not shown.
const EntryPoint = {
  async render() {
    main.injectGlobalStyles();
    // what the installed core can do, for the validators and the hints
    await main.loadCoreCapabilities();

    const netshiftMap = new form.Map("netshift", _("PostQ VPN"));

    // Service card
    const controlSection = netshiftMap.section(
      form.TypedSection,
      "control",
      _("Service"),
    );
    controlSection.anonymous = true;
    controlSection.addremove = false;
    controlSection.cfgsections = function () {
      return ["control"];
    };

    control.createControlContent(controlSection);

    // Subscription of the one proxy section of the profile
    const subscriptionSection = netshiftMap.section(
      form.NamedSection,
      "main",
      "section",
      _("Subscription"),
    );
    subscriptionSection.addremove = false;

    const o = subscriptionSection.option(
      form.DynamicList,
      "subscription_url",
      _("Subscription URLs"),
      _(
        "Paste the subscription link from your provider and press Save & Apply. The servers are updated from it every hour.",
      ),
    );
    o.placeholder = "https://example.com/api/sub";
    o.rmempty = true;
    o.validate = function (section_id, value) {
      if (!value || value.length === 0) {
        return true;
      }

      const validation = main.validateUrl(value);

      if (validation.valid) {
        return true;
      }

      return validation.message;
    };

    // Servers, ping and the subscription's expiry and traffic
    const dashboardSection = netshiftMap.section(
      form.TypedSection,
      "dashboard",
      _("Servers"),
    );
    dashboardSection.anonymous = true;
    dashboardSection.addremove = false;
    dashboardSection.cfgsections = function () {
      return ["dashboard"];
    };

    dashboard.createDashboardContent(dashboardSection);

    // Inject core service
    main.coreService();

    return netshiftMap.render();
  },
};

return view.extend(EntryPoint);
