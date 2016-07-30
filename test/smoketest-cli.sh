#!/bin/sh

export EXPECTED=$(cat test/csar-1/expected/definitions.tosca)

bin/toscafy generate \
  --debug \
  -o test-out \
  -c test/csar-1 \
  --camelize \
  --clear-output

cat test-out/Definitions/definitions.tosca
echo " "

export ACTUAL=$(cat test-out/Definitions/definitions.tosca)

rm -rf test-out

node -e "if (process.env.EXPECTED.replace(/\s/g, '') !== process.env.ACTUAL.replace(/\s/g, '')) { console.log('TEST FAILED: generated definitions.tosca file not as expected'); process.exit(1); } else { console.log('TEST PASSED') }"
