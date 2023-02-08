FROM node:16
WORKDIR /app
COPY . .
RUN npm config set registry https://registry.npm.taobao.org && npm install && npm install pm2 -g
EXPOSE 3000
CMD [ "pm2-runtime", "/app/index.js" ]