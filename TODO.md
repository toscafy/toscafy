# toscafy TODO

* integrate any2api into toscafy
  * add pipeable any2api/apify subcommand/parameter; forward to (dockerized?) any2api-cli (see yargs "stop parsing")
  * enhance soap generator: additional port type and service for TOSCA (lifecycle) operations



* support node types reqs & caps to generate topology skeletons
* support generating TOSCA YAML
* add built-in func $toscafy.fetchAsDir using decompress module
* think: options for 'generate' command: generate CSAR only for subset of given artifacts, node types, etc.
* think: support streaming of tarred context, i.e. 'specify' can produce a tar stream which is consumed by 'generate'
