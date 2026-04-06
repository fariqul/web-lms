FROM node:20-alpine

WORKDIR /app

# Install PM2 globally for cluster mode
RUN npm install -g pm2

COPY package.json ./
RUN npm install --production

COPY server.js ./
COPY ecosystem.config.js ./

EXPOSE 6001

# Set Node.js to use more memory (8GB for 64GB server)
ENV NODE_OPTIONS="--max-old-space-size=8192"

# Use PM2 in cluster mode to utilize all CPU cores
CMD ["pm2-runtime", "ecosystem.config.js"]
