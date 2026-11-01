include $(TOPDIR)/rules.mk

PKG_NAME:=postq

PKG_VERSION := $(if $(POSTQ_VERSION),$(POSTQ_VERSION),1.0.6)

PKG_RELEASE:=1

PKG_MAINTAINER:=ITDog <podkop@itdog.info>
PKG_LICENSE:=GPL-2.0-or-later

include $(INCLUDE_DIR)/package.mk

define Package/postq
	SECTION:=net
	CATEGORY:=Network
	DEPENDS:=+sing-box +curl +jq +kmod-nft-tproxy +coreutils-base64 +bind-dig
	CONFLICTS:=netshift https-dns-proxy nextdns luci-app-passwall luci-app-passwall2
	TITLE:=Domain routing app
	URL:=https://github.com/postq-vpn/postq-OW
	PKGARCH:=all
endef

define Package/postq/description
	Domain routing. Use of VLESS, Shadowsocks technologies
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/postq/prerm
#!/bin/sh

# block_leaks keeps dnsmasq pointed at the (now dead) sing-box DNS inbound and
# the guard table armed while the service is down. Nothing starts the service
# again after this script - not on a removal, and not on an upgrade either (the
# package has no postinst) - so that would leave the router without DNS. The
# stop below therefore releases the kill switch: DNS is handed back and the
# guard table is deleted. The stored option is left alone (/etc/config/postq
# is a conffile), so after an upgrade the next start arms the guard again.
export POSTQ_BLOCK_LEAKS_RELEASE=1

grep -q "105 postq" /etc/iproute2/rt_tables && sed -i "/105 postq/d" /etc/iproute2/rt_tables

/etc/init.d/postq stop

exit 0
endef

define Package/postq/conffiles
/etc/config/postq
endef

define Package/postq/install
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/postq $(1)/etc/init.d/postq
	$(INSTALL_BIN) ./files/etc/init.d/postq-naive $(1)/etc/init.d/postq-naive
	$(INSTALL_BIN) ./files/etc/init.d/postq-log $(1)/etc/init.d/postq-log

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/postq $(1)/etc/config/postq

	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/60_postq-profile $(1)/etc/uci-defaults/60_postq-profile

	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/usr/bin/postq $(1)/usr/bin/postq

	$(INSTALL_DIR) $(1)/usr/lib/postq
	$(CP) ./files/usr/lib/* $(1)/usr/lib/postq/

	sed -i -e 's/__COMPILED_VERSION_VARIABLE__/$(PKG_VERSION)/g' $(1)/usr/lib/postq/constants.sh
endef

$(eval $(call BuildPackage,postq))
