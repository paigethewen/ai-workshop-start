# The machine the web tests run on, here and on CI: the same Linux, Node, Chromium and fonts, so a screenshot
# is the same to the pixel wherever it is taken. run.ts builds it once per version of this file and publishes it
# to GHCR; every run after that pulls those same bytes. The base images are pinned by digest, Chromium to the
# build Playwright expects.
FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS node
FROM ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac
# The repository whose workflows publish and pull it.
LABEL org.opencontainers.image.source=https://github.com/paigethewen/ai-workshop-start
# The version in package-lock.json; run.ts passes it.
ARG PLAYWRIGHT
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright HOME=/tmp
WORKDIR /opt/playwright
# Chromium's libraries and Playwright's fonts, and DejaVu, the sans-serif and monospace of an Ubuntu desktop;
# then Chromium itself, the headless shell of browsers.json, from Chrome for Testing, where Playwright's own
# download comes from, laid out as `playwright install` lays it out; and Ubuntu's ffmpeg, in place of
# Playwright's, for the videos.
RUN npm install --no-save --no-audit --no-fund playwright-core@$PLAYWRIGHT \
  && npx playwright-core install-deps chromium-headless-shell \
  && apt-get install -y --no-install-recommends ca-certificates fonts-dejavu-core ffmpeg curl unzip && rm -rf /var/lib/apt/lists/*
RUN browser() { node -p "require('./node_modules/playwright-core/browsers.json').browsers.find((b) => b.name === '$1').$2"; } \
  && version=$(browser chromium-headless-shell browserVersion) \
  && dir=$PLAYWRIGHT_BROWSERS_PATH/chromium_headless_shell-$(browser chromium-headless-shell revision) \
  && mkdir -p $dir \
  && curl -fsSLo shell.zip https://storage.googleapis.com/chrome-for-testing-public/$version/linux64/chrome-headless-shell-linux64.zip \
  && unzip -q shell.zip -d $dir && touch $dir/INSTALLATION_COMPLETE \
  && ffmpeg=$PLAYWRIGHT_BROWSERS_PATH/ffmpeg-$(browser ffmpeg revision) && mkdir -p $ffmpeg \
  && ln -s /usr/bin/ffmpeg $ffmpeg/ffmpeg-linux && touch $ffmpeg/INSTALLATION_COMPLETE \
  && chmod -R a+rX $PLAYWRIGHT_BROWSERS_PATH && cd / && rm -rf /opt/playwright
WORKDIR /work
