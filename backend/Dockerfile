FROM node:20-alpine

WORKDIR /app

# Install only production deps for a smaller image
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

EXPOSE 3001

CMD ["node", "index.js"]
