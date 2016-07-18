# toscafy TODO

* core toscafy project contains lib+cli+api to generate CSARs, merge CSARs, generate topologies, ...
* additional projects (lib+cli): toscafy-chef, toscafy-docker, toscafy-devopsbase, ...

* replace path.join by path.resolve to allow absolute paths in csarspec
* make definition of output param optional, write to temp location by default
* set context/workingDir=outputDir/tempDir if csarspec is provided through stdin



### Further ideas

* add and process reqs and caps to generate topology skeletons
* support for generating TOSCA YAML
* custom input and output params for operations
