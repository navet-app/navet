#!/usr/bin/with-contenv bashio
set -euo pipefail

CONFIG_DIR="/usr/share/nginx/html"
CONFIG_FILE="${CONFIG_DIR}/config.js"
DIRECT_CONFIG_FILE="${CONFIG_DIR}/direct-config.js"
NGINX_CONF="/etc/nginx/http.d/default.conf"
DIRECT_NGINX_CONF="/etc/nginx/http.d/direct.conf"

ALLOW_INSECURE_PROVIDER_TLS="$(bashio::config 'allow_insecure_provider_tls')"

remove_obsolete_options() {
  local saved_options
  if ! saved_options="$(bashio::addon.options 2>/dev/null)"; then
    return
  fi

  local option
  for option in \
    dashboard_config_url \
    homey_client_id \
    homey_client_secret \
    homey_redirect_uri \
    hass_url \
    token; do
    if bashio::jq.exists "${saved_options}" ".${option}"; then
      bashio::log.info "Removing obsolete ${option} option"
      bashio::addon.option "${option}"
    fi
  done
}

remove_obsolete_options

mkdir -p /data
chown nginx:nginx /data 2>/dev/null || true

INSTALLATION_KEY_PATH="/data/navet-installation-key"
if [[ -f "${INSTALLATION_KEY_PATH}" ]]; then
  NAVET_INSTALLATION_KEY="$(tr -d '\r\n' < "${INSTALLATION_KEY_PATH}")"
  if ! printf '%s' "${NAVET_INSTALLATION_KEY}" | grep -Eq '^[a-f0-9]{64}$'; then
    echo "${INSTALLATION_KEY_PATH} is invalid; refusing to replace installation authority" >&2
    exit 1
  fi
else
  NAVET_INSTALLATION_KEY="$(
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
  )"
  printf '%s\n' "${NAVET_INSTALLATION_KEY}" > "${INSTALLATION_KEY_PATH}.tmp"
  chmod 600 "${INSTALLATION_KEY_PATH}.tmp"
  mv "${INSTALLATION_KEY_PATH}.tmp" "${INSTALLATION_KEY_PATH}"
fi
chmod 600 "${INSTALLATION_KEY_PATH}"
chown nginx:nginx "${INSTALLATION_KEY_PATH}" 2>/dev/null || true

INSTALLATION_SETUP_MARKER_PATH="/data/navet-setup-code-initialized"
if [[ ! -f "${INSTALLATION_SETUP_MARKER_PATH}" ]]; then
  /usr/local/bin/navet-setup-code >&2
  touch "${INSTALLATION_SETUP_MARKER_PATH}"
  chmod 600 "${INSTALLATION_SETUP_MARKER_PATH}"
  chown nginx:nginx "${INSTALLATION_SETUP_MARKER_PATH}" 2>/dev/null || true
fi

INSTALLATION_CONFIG_PATH="/data/navet-installation-config.json"
printf '{"version":1,"hassUrl":null,"openhabUrl":null}\n' \
  > "${INSTALLATION_CONFIG_PATH}.tmp"
chmod 600 "${INSTALLATION_CONFIG_PATH}.tmp"
mv "${INSTALLATION_CONFIG_PATH}.tmp" "${INSTALLATION_CONFIG_PATH}"
chown nginx:nginx "${INSTALLATION_CONFIG_PATH}" 2>/dev/null || true

RESOLVER_ADDRESSES="$(
  awk '
    $1 == "nameserver" && $2 ~ /^[0-9A-Fa-f:.]+$/ {
      if (index($2, ":") > 0) {
        printf "[%s] ", $2
      } else {
        printf "%s ", $2
      }
    }
  ' /etc/resolv.conf
)"
if [[ -z "${RESOLVER_ADDRESSES}" ]]; then
  echo "No usable runtime DNS resolver found in /etc/resolv.conf" >&2
  exit 1
fi
printf 'resolver %svalid=30s ipv6=off;\n' "${RESOLVER_ADDRESSES}" \
  > /etc/nginx/resolver.conf

PROVIDER_TLS_VERIFY=on
if [[ "${ALLOW_INSECURE_PROVIDER_TLS}" == "true" ]]; then
  PROVIDER_TLS_VERIFY=off
  echo "WARNING: provider TLS certificate verification is explicitly disabled" >&2
fi

export NAVET_ALLOW_INSECURE_PROVIDER_TLS="${ALLOW_INSECURE_PROVIDER_TLS}"
export NAVET_TRUST_HOME_ASSISTANT_INGRESS="true"
export NAVET_HOME_ASSISTANT_INGRESS_PORT="8099"
export NAVET_PROVIDER_TLS_VERIFY="${PROVIDER_TLS_VERIFY}"

cat > "${CONFIG_FILE}" <<EOF
window.__NAVET_CONFIG__ = {
  runtime: "ha-ingress",
  proxyBaseUrl: "/__navet_ha_proxy__"
};
EOF

cat > "${DIRECT_CONFIG_FILE}" <<EOF
window.__NAVET_CONFIG__ = {
  proxyBaseUrl: "/__navet_ha_proxy__"
};
EOF

printf '%s\n' \
  '{"candidates":[{"url":"http://homeassistant.local:8123","source":"hostname","reachable":false}]}' \
  > "${CONFIG_DIR}/navet-discovery-home-assistant.json"

cp /etc/navet-nginx/ha-proxy.template.js /etc/nginx/njs/ha-proxy.js

cat > "${NGINX_CONF}" <<EOF
server {
  listen 8099;
  server_name _;
  allow 172.30.32.2;
  deny all;

  root /usr/share/nginx/html;
  index index.html;

  include /etc/nginx/snippets/navet-security-headers.conf;
  include /etc/nginx/snippets/navet-homey-store.conf;
  include /etc/nginx/snippets/navet-openhab-store.conf;
  include /etc/nginx/snippets/navet-profile-store-ingress.conf;
  include /etc/nginx/snippets/navet-chore-store-ingress.conf;
  js_set \$navet_provider_proxy_request_allowed navet_homey_proxy.request_allowed;

  location = /__navet_chore_scheduler__ {
    internal;
    js_periodic navet_chore_store.runPeriodic interval=60s;
  }

  # Ingress resources use paths signed by the current user's parent HA connection.
  # Never expose a Supervisor-authenticated Home Assistant proxy to the browser.
  location ^~ /__navet_ha_proxy__ {
    return 403;
  }

  location /__navet_homey_proxy__/ {
    include /etc/nginx/snippets/navet-security-headers.conf;
    if (\$navet_provider_proxy_request_allowed = "") {
      return 403;
    }
    if (\$uri ~ "\.\.") {
      return 400;
    }
    js_set \$navet_homey_proxy_url navet_homey_proxy.upstream_url;
    js_set \$navet_homey_proxy_auth_header navet_homey_proxy.authorization_header;
    js_set \$navet_homey_session_cookie navet_homey_store.touchSessionCookie;

    if (\$navet_homey_proxy_url = "") {
      return 502;
    }

    add_header Set-Cookie \$navet_homey_session_cookie always;
    proxy_pass \$navet_homey_proxy_url;
    proxy_ssl_server_name on;
    proxy_ssl_name \$proxy_host;
    proxy_ssl_verify ${PROVIDER_TLS_VERIFY};
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
    proxy_ignore_headers X-Accel-Redirect X-Accel-Expires X-Accel-Buffering X-Accel-Charset X-Accel-Limit-Rate Set-Cookie;
    proxy_hide_header Set-Cookie;
    proxy_hide_header Location;
    proxy_hide_header WWW-Authenticate;
    proxy_hide_header X-Accel-Redirect;
    proxy_hide_header Access-Control-Allow-Origin;
    proxy_hide_header Access-Control-Allow-Credentials;
    proxy_hide_header Access-Control-Allow-Headers;
    proxy_hide_header Access-Control-Allow-Methods;
    proxy_hide_header Access-Control-Expose-Headers;
    proxy_hide_header Access-Control-Max-Age;
    proxy_http_version 1.1;
    proxy_set_header Host \$proxy_host;
    proxy_set_header Forwarded "";
    proxy_set_header X-Forwarded-For "";
    proxy_set_header X-Forwarded-Host "";
    proxy_set_header X-Forwarded-Proto "";
    proxy_set_header X-Real-IP "";
    proxy_set_header Cookie "";
    proxy_set_header X-Navet-Installation-Key "";
    proxy_set_header Authorization \$navet_homey_proxy_auth_header;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }

  location = /__navet_openhab_proxy__/ws {
    include /etc/nginx/snippets/navet-security-headers.conf;
    js_set \$navet_openhab_proxy_url navet_openhab_proxy.upstream_url;
    js_set \$navet_openhab_proxy_auth_header navet_openhab_proxy.authorization_header;
    js_set \$navet_openhab_session_cookie navet_openhab_store.touchSessionCookie;

    if (\$navet_openhab_proxy_url = "") {
      return 502;
    }

    add_header Cache-Control "no-store" always;
    add_header Set-Cookie \$navet_openhab_session_cookie always;
    proxy_pass \$navet_openhab_proxy_url;
    proxy_ssl_server_name on;
    proxy_ssl_name \$proxy_host;
    proxy_ssl_verify ${PROVIDER_TLS_VERIFY};
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
    proxy_ignore_headers X-Accel-Redirect X-Accel-Expires X-Accel-Buffering X-Accel-Charset X-Accel-Limit-Rate Set-Cookie;
    proxy_hide_header Set-Cookie;
    proxy_hide_header Location;
    proxy_hide_header WWW-Authenticate;
    proxy_hide_header X-Accel-Redirect;
    proxy_hide_header Access-Control-Allow-Origin;
    proxy_hide_header Access-Control-Allow-Credentials;
    proxy_hide_header Access-Control-Allow-Headers;
    proxy_hide_header Access-Control-Allow-Methods;
    proxy_hide_header Access-Control-Expose-Headers;
    proxy_hide_header Access-Control-Max-Age;
    proxy_http_version 1.1;
    proxy_set_header Host \$proxy_host;
    proxy_set_header Forwarded "";
    proxy_set_header X-Forwarded-For "";
    proxy_set_header X-Forwarded-Host "";
    proxy_set_header X-Forwarded-Proto "";
    proxy_set_header X-Real-IP "";
    proxy_set_header Cookie "";
    proxy_set_header X-Navet-Installation-Key "";
    proxy_set_header Authorization \$navet_openhab_proxy_auth_header;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }

  location /__navet_openhab_proxy__/ {
    include /etc/nginx/snippets/navet-security-headers.conf;
    if (\$uri ~ "\.\.") {
      return 400;
    }
    js_set \$navet_openhab_proxy_url navet_openhab_proxy.upstream_url;
    js_set \$navet_openhab_proxy_auth_header navet_openhab_proxy.authorization_header;
    js_set \$navet_openhab_session_cookie navet_openhab_store.touchSessionCookie;

    if (\$navet_openhab_proxy_url = "") {
      return 502;
    }

    add_header Cache-Control "no-store" always;
    add_header Set-Cookie \$navet_openhab_session_cookie always;
    proxy_pass \$navet_openhab_proxy_url;
    proxy_ssl_server_name on;
    proxy_ssl_name \$proxy_host;
    proxy_ssl_verify ${PROVIDER_TLS_VERIFY};
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
    proxy_ignore_headers X-Accel-Redirect X-Accel-Expires X-Accel-Buffering X-Accel-Charset X-Accel-Limit-Rate Set-Cookie;
    proxy_hide_header Set-Cookie;
    proxy_hide_header Location;
    proxy_hide_header WWW-Authenticate;
    proxy_hide_header X-Accel-Redirect;
    proxy_hide_header Access-Control-Allow-Origin;
    proxy_hide_header Access-Control-Allow-Credentials;
    proxy_hide_header Access-Control-Allow-Headers;
    proxy_hide_header Access-Control-Allow-Methods;
    proxy_hide_header Access-Control-Expose-Headers;
    proxy_hide_header Access-Control-Max-Age;
    proxy_http_version 1.1;
    proxy_set_header Host \$proxy_host;
    proxy_set_header Forwarded "";
    proxy_set_header X-Forwarded-For "";
    proxy_set_header X-Forwarded-Host "";
    proxy_set_header X-Forwarded-Proto "";
    proxy_set_header X-Real-IP "";
    proxy_set_header Cookie "";
    proxy_set_header X-Navet-Installation-Key "";
    proxy_set_header Authorization \$navet_openhab_proxy_auth_header;
    proxy_set_header Upgrade "";
    proxy_set_header Connection "";
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
  }

  include /etc/nginx/snippets/navet-rss-proxy-ingress.conf;

  location = /config.js {
    include /etc/nginx/snippets/navet-security-headers.conf;
    add_header Cache-Control "no-store";
    try_files \$uri =404;
  }

  location /assets/ {
    try_files \$uri =404;
  }

  location ~* \.(?:js|mjs|css|map|png|svg|ico|webmanifest)$ {
    try_files \$uri =404;
  }

  location / {
    include /etc/nginx/snippets/navet-security-headers.conf;
    sub_filter '<head>' '<head><base href="\$http_x_ingress_path/">';
    sub_filter '<link rel="manifest" href="' '<link rel="x-navet-disabled-manifest" href="';
    sub_filter_once on;
    add_header Cache-Control "no-store";
    try_files \$uri \$uri/ /index.html;
  }
}
EOF

awk '
  /^  listen 80;$/ {
    print "  listen 8080;"
    next
  }
  /^  location = \/config\.js \{$/ {
    in_runtime_config = 1
  }
  in_runtime_config && /try_files \$uri =404;/ {
    print "    alias /usr/share/nginx/html/direct-config.js;"
    next
  }
  in_runtime_config && /^  \}$/ {
    in_runtime_config = 0
  }
  { print }
' /etc/navet-nginx/direct.conf.template \
  | envsubst '${NAVET_PROVIDER_TLS_VERIFY}' \
  > "${DIRECT_NGINX_CONF}"

exec /usr/local/bin/navet-runtime nginx -g 'daemon off;'
