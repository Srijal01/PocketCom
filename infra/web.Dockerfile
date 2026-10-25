FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_SIGNALING_URL
ENV VITE_SIGNALING_URL=${VITE_SIGNALING_URL}
COPY package*.json ./
COPY apps/web apps/web
RUN npm install
RUN npm run build --workspace @pocketcam/web

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
