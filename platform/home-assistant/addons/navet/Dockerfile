ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.20
ARG BUILD_VERSION=dev
ARG BUILD_ARCH=amd64
ARG NAVET_GIT_SHA=local
ARG NAVET_BUILD_DATE=1970-01-01T00:00:00.000Z
ARG NAVET_RELEASE_CHANNEL=development
ARG NAVET_BUILD_VERSION=0.0.0
ARG NAVET_VERSION=0.0.0

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/standalone/package.json apps/standalone/package.json
COPY packages/app/package.json packages/app/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/provider-homeassistant/package.json packages/provider-homeassistant/package.json
COPY packages/provider-homey/package.json packages/provider-homey/package.json
COPY packages/provider-openhab/package.json packages/provider-openhab/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.node.json postcss.config.mjs vite.config.ts ./
COPY apps/standalone apps/standalone
COPY packages packages
COPY assets assets
COPY scripts scripts
COPY docker/shared docker/shared
COPY docker/njs/chore-durable-storage.js docker/njs/chore-durable-storage.js
# Apply release metadata after reusable dependency and source layers.
ARG NAVET_ENABLE_DEMO=false
ARG NAVET_GIT_SHA
ARG NAVET_BUILD_DATE
ARG NAVET_RELEASE_CHANNEL
ARG NAVET_BUILD_VERSION
ARG NAVET_VERSION

ENV NAVET_GIT_SHA=$NAVET_GIT_SHA
ENV NAVET_BUILD_DATE=$NAVET_BUILD_DATE
ENV NAVET_RELEASE_CHANNEL=$NAVET_RELEASE_CHANNEL
ENV NAVET_BUILD_VERSION=$NAVET_BUILD_VERSION
ENV NAVET_VERSION=$NAVET_VERSION

RUN NAVET_ENABLE_DEMO=$NAVET_ENABLE_DEMO pnpm build

FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS rss-transport-build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY docker/rss-transport docker/rss-transport
RUN GO111MODULE=off go test ./docker/rss-transport \
  && GO111MODULE=off CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build \
    -trimpath -ldflags="-s -w" -o /out/rss-transport ./docker/rss-transport

FROM ${BUILD_FROM}
ARG BUILD_VERSION
ARG BUILD_ARCH

RUN apk add --no-cache bash gettext nginx nginx-mod-http-js su-exec

COPY platform/home-assistant/addons/navet/run.sh /run.sh
COPY docker/navet-runtime.sh /usr/local/bin/navet-runtime
COPY docker/navet-setup-code.sh /usr/local/bin/navet-setup-code
COPY --from=rss-transport-build /out/rss-transport /etc/navet/rss-transport
COPY platform/home-assistant/addons/navet/rootfs/ /
COPY docker/njs/rss-proxy.js /etc/nginx/njs/rss-proxy.js
COPY docker/njs/resource-host-policy.js /etc/nginx/njs/resource-host-policy.js
COPY docker/njs/profile-store.js /etc/nginx/njs/profile-store.js
COPY docker/shared /etc/nginx/shared
COPY docker/njs/chore-store.js /etc/nginx/njs/chore-store.js
COPY docker/njs/chore-durable-storage.js /etc/nginx/njs/chore-durable-storage.js
COPY docker/njs/chore-occurrence-policy.js /etc/nginx/njs/chore-occurrence-policy.js
COPY docker/njs/chore-calendar-policy.js /etc/nginx/njs/chore-calendar-policy.js
COPY docker/njs/chore-progress-policy.js /etc/nginx/njs/chore-progress-policy.js
COPY docker/njs/chore-recurrence-policy.js /etc/nginx/njs/chore-recurrence-policy.js
COPY docker/njs/auth-store.js /etc/nginx/njs/auth-store.js
COPY docker/njs/provider-session-store.js /etc/nginx/njs/provider-session-store.js
COPY docker/njs/installation-authority.js /etc/nginx/njs/installation-authority.js
COPY docker/njs/device-session-authority.js /etc/nginx/njs/device-session-authority.js
COPY docker/njs/installation-cookie-scope.js /etc/nginx/njs/installation-cookie-scope.js
COPY docker/njs/openhab-store.js /etc/nginx/njs/openhab-store.js
COPY docker/njs/openhab-proxy.js /etc/nginx/njs/openhab-proxy.js
COPY docker/njs/homey-store.js /etc/nginx/njs/homey-store.js
COPY docker/njs/homey-proxy.js /etc/nginx/njs/homey-proxy.js
COPY docker/njs/ha-proxy.template.js /etc/navet-nginx/ha-proxy.template.js
COPY docker/nginx.conf /etc/navet-nginx/direct.conf.template
COPY docker/snippets/navet-rss-proxy.conf /etc/nginx/snippets/navet-rss-proxy.conf
COPY docker/snippets/navet-rss-proxy-ingress.conf /etc/nginx/snippets/navet-rss-proxy-ingress.conf
COPY docker/snippets/navet-rss-transport.conf /etc/nginx/snippets/navet-rss-transport.conf
COPY docker/snippets/navet-profile-store.conf /etc/nginx/snippets/navet-profile-store.conf
COPY docker/snippets/navet-profile-store-ingress.conf /etc/nginx/snippets/navet-profile-store-ingress.conf
COPY docker/snippets/navet-chore-store.conf /etc/nginx/snippets/navet-chore-store.conf
COPY docker/snippets/navet-chore-store-ingress.conf /etc/nginx/snippets/navet-chore-store-ingress.conf
COPY docker/snippets/navet-auth-store.conf /etc/nginx/snippets/navet-auth-store.conf
COPY docker/snippets/navet-device-session-store.conf /etc/nginx/snippets/navet-device-session-store.conf
COPY docker/snippets/navet-openhab-store.conf /etc/nginx/snippets/navet-openhab-store.conf
COPY docker/snippets/navet-homey-store.conf /etc/nginx/snippets/navet-homey-store.conf
COPY docker/snippets/navet-discovery.conf /etc/nginx/snippets/navet-discovery.conf
COPY docker/snippets/navet-security-headers.conf /etc/nginx/snippets/navet-security-headers.conf
COPY --from=build /app/apps/standalone/dist /usr/share/nginx/html

RUN mkdir -p /data \
  && chown -R nginx:nginx /data \
  && chmod a+x /run.sh /usr/local/bin/navet-runtime /usr/local/bin/navet-setup-code

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="addon" \
  io.hass.arch="${BUILD_ARCH}"

EXPOSE 8080 8099

CMD ["/run.sh"]
