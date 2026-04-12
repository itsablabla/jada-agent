FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY *.mjs ./
EXPOSE 3000
CMD ["node", "server.mjs"]
