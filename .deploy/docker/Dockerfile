# Build the static site, then serve it. Two stages so the runtime image
# carries neither node_modules nor the markdown sources.
FROM node:22-bookworm-slim AS build

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS serve

RUN useradd --user-group --create-home --shell /bin/false appuser

ENV PNPM_HOME=/pnpm-global
ENV PATH=${PNPM_HOME}/bin:${PATH}

RUN corepack enable \
 && mkdir -p "${PNPM_HOME}/bin" \
 && corepack pnpm add -g http-server \
 && rm -rf /var/lib/apt/lists/* /tmp/* /root/.npm /root/.pnpm-store

WORKDIR /app

# The built pages contain absolute links to /mitdp/* (partials/footer.html and
# the sidebar nav), because production serves from the GitHub Pages project
# subpath https://maryland-gov.github.io/mitdp/. Mounting the build under
# /app/mitdp reproduces that prefix so those links resolve in preview too,
# without having to rewrite them for two different bases.
COPY --from=build /src/docs ./mitdp

# build.js emits no docs/index.html, only docs/404.html, so the container root
# would otherwise 404 — including for the readiness probe. Send / to the real
# entry page and give the probe a static file that never depends on content.
RUN printf '%s\n' \
      '<!doctype html>' \
      '<meta charset="utf-8">' \
      '<meta http-equiv="refresh" content="0; url=/mitdp/overview/">' \
      '<title>MITDP Oversight</title>' \
      '<link rel="canonical" href="/mitdp/overview/">' \
      '<p><a href="/mitdp/overview/">MITDP Oversight</a></p>' \
      > ./index.html \
 && cp ./index.html ./mitdp/index.html \
 && printf 'ok\n' > ./healthz \
 && chown -R appuser:appuser /app

EXPOSE 3000

USER appuser

# -d false disables directory listings. Without it http-server renders an
# "Index of /mitdp/images/" page for any directory lacking an index.html,
# which both looks broken and enumerates the tree on a public site's preview.
CMD ["http-server", ".", "-p", "3000", "-a", "0.0.0.0", "--cors", "-d", "false"]
