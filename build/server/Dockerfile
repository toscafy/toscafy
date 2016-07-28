FROM node:4

MAINTAINER Johannes Wettinger, http://github.com/jojow

RUN npm install forever -g
RUN npm install toscafy specify-artifact

EXPOSE 3000

CMD [ "forever", "-a", "-o", "out.log", "-e", "err.log", "./node_modules/toscafy/bin/server" ]
