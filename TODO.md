# toscafy TODO

* extend toscafy Wrapper.js to support more kinds of artifacts by generating apispecs that just use the shell invoker (e.g. command calling ansible)
  * think: implement as part of any2api-invoker-shell (shell-docker, shell-ansible, shell-matlab, ...)

* use js-yaml module for all JSON things (read CSAR spec, built-in functions, ...)

* add script to csar-bricks pipeline: https://www.npmjs.com/package/identicon



* add built-in functions $toscafy.fetchAsDir,addDirAsZip,addDirAsTgz using decompress and archiver module
* support node types reqs & caps to generate topology skeletons
* support generating TOSCA YAML
* support reading Markdown as 'literate CSAR specs'
* allow definition of operations and artifacts directly in conjunction with topology nodes without explicitly defining node types
* think: support reading TOSCA YAML as artifact
* think: options for 'generate' command: generate CSAR only for subset of given artifacts, node types, etc.
* think: support streaming of tarred context, i.e. 'specify' can produce a tar stream which is consumed by 'generate'
