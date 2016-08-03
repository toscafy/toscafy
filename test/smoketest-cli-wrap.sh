#!/bin/sh

export EXPECTED="$(cat test/expected/cli-wrap_definitions.tosca)"

bin/toscafy specify -D \
  -i chef:mysql:5.6.1 \
  --wrap rest-api \
  | bin/toscafy generate -D \
    -o test-out \
    --clear-output \
    -s -

cat test-out/Definitions/definitions.tosca
echo " "

export ACTUAL="$(cat test-out/Definitions/definitions.tosca)"

rm -rf test-out

node -e "if (process.env.EXPECTED.replace(/\s/g, '') !== process.env.ACTUAL.replace(/\s/g, '')) { console.log('TEST FAILED: generated definitions.tosca file not as expected'); process.exit(1); } else { console.log('TEST PASSED') }"
