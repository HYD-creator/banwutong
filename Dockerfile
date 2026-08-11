FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY index.html app.js styles.css ./
COPY public ./public
COPY server ./server
ENV NODE_ENV=production PORT=4174 DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 4174
CMD ["npm", "run", "server"]
