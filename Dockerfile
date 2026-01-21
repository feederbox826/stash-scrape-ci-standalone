FROM node:alpine AS build
WORKDIR /app
COPY package.json tsconfig.json .
COPY src ./src
COPY types ./types
RUN npm install
RUN npm i -g typescript
RUN tsc

FROM node:alpine AS final
WORKDIR /app
COPY package.json .
COPY public ./public
COPY --from=build /app/dist ./dist
COPY --from=build /app/package-lock.json .
RUN npm ci
CMD ["dist/src/index.js"]