# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* env vars at build time, so accept them as build args.
# This keeps the image environment-agnostic — pass real values via:
#   docker build --build-arg VITE_API_URL=https://api.example.com ...
ARG VITE_MAPBOX_TOKEN
ARG VITE_API_URL
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---- Runtime stage: serve static files via nginx ----
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
