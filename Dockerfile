FROM node:24-bookworm-slim
WORKDIR /app
COPY server ./server
COPY public ./public
COPY app.js index.html styles.css ./
RUN mkdir -p /app/data
ENV NODE_ENV=production PORT=4174 DATA_DIR=/app/data
EXPOSE 4174
VOLUME ["/app/data"]
CMD ["node", "server/index.mjs"]
