# syntax=docker/dockerfile:1.7
ARG TERRAFORM_VERSION=1.9.8

############################
# 1. deps — install OS deps, terraform CLI, and npm packages
############################
FROM node:22-bookworm-slim AS deps
ARG TERRAFORM_VERSION
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip \
 && curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" -o /tmp/tf.zip \
 && unzip /tmp/tf.zip -d /usr/local/bin \
 && rm -f /tmp/tf.zip \
 && apt-get purge -y unzip curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# `npm ci` is strict about lockfile matching; the committed lockfile
# has known drift (e.g. picomatch transitive). `npm install` reconciles it.
RUN npm install --no-audit --no-fund

############################
# 2. build — produce Next.js standalone output
############################
FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

############################
# 3. runtime — minimal image: terraform + standalone server + static assets
############################
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /usr/local/bin/terraform /usr/local/bin/terraform

# Standalone bundle: server.js at root, .next/static alongside.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 8080
CMD ["node", "server.js"]
