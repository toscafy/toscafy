FROM node:4

MAINTAINER Johannes Wettinger, http://github.com/jojow

RUN npm install toscafy -g

ENTRYPOINT [ "toscafy" ]
CMD [ "--help" ]
