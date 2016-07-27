#!/bin/sh

bin/toscafy generate \
  --debug \
  -o test-out \
  -c test/csar-1 \
  --camelize \
  --clear-output

cat test-out/Definitions/definitions.tosca

rm -rf test-out
