FROM node:18-alpine as base
WORKDIR /app
# RUN npm install -g npm@latest
RUN npm install --location=global @angular/cli@16.2.1
COPY package.json ./
RUN npm install --force --save
COPY . /app
RUN npm run build-prod

## STAGE 2: Run ###
FROM nginx:latest
COPY --from=base /app/dist/fin_product /usr/share/nginx/html
# COPY --from=base /app/out /usr/share/nginx/html
EXPOSE 80
EXPOSE 443
