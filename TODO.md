# toscafy TODO

* how to include icons for Winery?

* integrate any2api into toscafy:
  * implement APIWrapper.js
    * interact with (dockerized?) any2api-cli
    * derive apispec.json from artifact-spec.json
  * CLI+REST: add any2api/apify subcommand/parameter
  * enhance soap generator:
    * additional port type and service for TOSCA (lifecycle) operations
    * async callback, see invoker.wsdl: https://github.com/OpenTOSCA/container/tree/fddb5668c7be4b6b6985f2a110897a0d151b4d39/org.opentosca.planbuilder.provphase.plugin.invoker/META-INF/resources
    * flat properties without instance object



* support node types reqs & caps to generate topology skeletons
* support generating TOSCA YAML
* integrate swagger-ui to play with API server
* add built-in func $toscafy.fetchAsDir using decompress module
* think: options for 'generate' command: generate CSAR only for subset of given artifacts, node types, etc.
* think: support streaming of tarred context, i.e. 'specify' can produce a tar stream which is consumed by 'generate'
