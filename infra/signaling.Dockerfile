FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY packages/shared-types packages/shared-types
COPY services/signaling-server services/signaling-server
RUN npm install
RUN npm run build --workspace @pocketcam/shared-types
RUN npm run build --workspace @pocketcam/signaling-server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/signaling-server/dist ./services/signaling-server/dist
COPY --from=build /app/services/signaling-server/package.json ./services/signaling-server/package.json
CMD ["node", "services/signaling-server/dist/src/index.js"]
