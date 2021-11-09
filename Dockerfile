FROM node:14 as builder
WORKDIR /workdir

COPY package.json yarn.lock ./
RUN yarn install

COPY tsconfig.json ./
COPY tsconfig.build.json ./
COPY src ./src
COPY appsettings/appsettings.json ./appsettings/appsettings.json
COPY secrets/secrets.json ./secrets/secrets.json
RUN yarn build

# production images
FROM node:14-alpine

RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--", "node", "./dist/src/main.js"]

WORKDIR /workdir
COPY --from=builder /workdir .