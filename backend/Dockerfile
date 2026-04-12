FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY *.mjs ./
EXPOSE 3200
CMD ["node", "server.mjs"]
