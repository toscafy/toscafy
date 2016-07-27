#!/bin/sh

# test file uploads: https://www.npmjs.com/package/form-data

export BASE_URL="http://localhost:3000"

export CSAR_SPEC=$(cat test/csar-1/csarspec.json)

tar -czf test-in.tar test/csar-1



#
# CSAR spec included in context
#

export JOB_JSON=$(curl --silent -L -F "strip=2" -F "context=@test-in.tar" $BASE_URL/commands/generate)

export JOB_LINK=$(node -e "console.log(JSON.parse(process.env.JOB_JSON).links.self)")

echo $JOB_LINK

sleep 5

export RESULT_JSON=$(curl --silent $BASE_URL$JOB_LINK)

node -e "console.log(JSON.parse(process.env.RESULT_JSON).status)"



#
# CSAR spec as separate file
#

export JOB_JSON=$(curl --silent -L -F "strip=2" -F "context=@test-in.tar" -F "csarspec=@test/csar-1/csarspec.json" $BASE_URL/commands/generate)

export JOB_LINK=$(node -e "console.log(JSON.parse(process.env.JOB_JSON).links.self)")

echo $JOB_LINK

sleep 5

export RESULT_JSON=$(curl --silent $BASE_URL$JOB_LINK)

node -e "console.log(JSON.parse(process.env.RESULT_JSON).status)"



#
# CSAR spec as text field
#

export JOB_JSON=$(curl --silent -L -F "strip=2" -F "context=@test-in.tar" -F "csarSpec=$CSAR_SPEC" $BASE_URL/commands/generate)

export JOB_LINK=$(node -e "console.log(JSON.parse(process.env.JOB_JSON).links.self)")

echo $JOB_LINK

sleep 5

export RESULT_JSON=$(curl --silent $BASE_URL$JOB_LINK)

node -e "console.log(JSON.parse(process.env.RESULT_JSON).status)"

node -e "console.log(JSON.stringify(JSON.parse(process.env.RESULT_JSON), null, 2))"



#
# cleanup
#

rm test-in.tar
