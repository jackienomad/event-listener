FROM public.ecr.aws/docker/library/node:18.9.0 as build
# FROM node:17 as build
WORKDIR /app
COPY . ./

RUN yarn install --frozen-lockfile
RUN yarn build 

ENV PORT=80

EXPOSE 80
CMD [ "yarn", "start" ]
