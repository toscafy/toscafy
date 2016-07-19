# toscafy TODO

* core toscafy project contains lib+cli+api to generate CSARs, merge CSARs, generate topologies, ...
* additional projects (lib+cli): toscafy-chef, toscafy-docker, toscafy-devopsbase, ...
  * no separate CLIs but try to dynamically load them in toscafy
  * reuse code from any2api modules

* replace request by got module



* add and process reqs and caps to generate topology skeletons
* support for generating TOSCA YAML
* custom input and output params for operations
* options for 'generate' command: generate CSAR only for subset of given artifacts, node types, etc.
