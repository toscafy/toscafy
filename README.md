# toscafy

[![Build Status](https://travis-ci.org/toscafy/toscafy.svg?branch=master)](https://travis-ci.org/toscafy/toscafy)

Manually creating TOSCA CSARs consisting of node types, artifact templates, and topology templates is not so much fun: several abstraction layers paired with a sophisticated XML syntax makes managing CSARs challenging to say the least.

Therefore, **toscafy** aims to simplify this task without relying on a specific modeling tool.
You just create a `csarspec.json` file that exactly consists of the parts required to generate a corresponding CSAR.
By using **toscafy**, CSARs are no longer maintained manually as source artifacts, but they are generated based on the CSAR spec.
Thus, it is enough to store the CSAR spec and all related files such as scripts inside a version-controlled repository.
An associated CI/CD pipeline could then rebuild, test, and publish the resulting CSARs when changes are committed.
This helps to apply established CI/CD principles by automating the build and delivery process of CSARs.



## Get started

First, you need to install **toscafy**.
Node.js version 4 or better is required.
Use npm to install **toscafy**:

    npm install toscafy -g

Then you need to create a `csarspec.json` file.
As a starting point, you could pick one from the [test](test) folder.
Change into the directory in which the `csarspec.json` file is located.
Run the following command to generate a CSAR as directory:

    toscafy generate -o /my/csar-dir

Alternatively, you could produce a CSAR that's already packaged as single ZIP file:

    toscafy generate -p -o /my/csar.zip

Instead of installing **toscafy** on your machine, you can immediately run it using Docker:

    docker run toscafy/cli --help



## REST API server

You can also use the REST API server to interact or programmatically integrate with **toscafy**:

    toscafy server

Alternatively using Docker:

    docker run -p 3000:3000 toscafy/server

By default, the server listens on port `3000` for HTTP requests.



## CSAR spec schema

A `csarspec.json` file is structured as follows:

``` plaintext
{
  "csar_name":       (string),    # name of CSAR

  "node_types": {
    (nodeTypeName): {
      "properties_schema": {
        (nodeTypePropertyName): {
          "type":    (string),    # XSD type
          "default": (string),    # default value
          "input": [              # map input param
            (operationName) | "*"
          ],
          "output": [             # map output param
            (operationName) | "*"
          ]
        }
      },

      "operations": {
        (operationName): [
          (artifactName) | (artifactObject)
        ]
      },

      "deployment_artifacts": [
        (artifactName) | (artifactObject)
      ]
    }
  },

  "artifacts": {
    (artifactName): {
      "type": (string),   # artifact type
      "wrap": (string),   # wrap artifact as ...

      "properties": {
        (artifactPropertyName): (any)
      },

      "references": [
        (string)          # relative file path
      ]
    }
  },

  "topologies": {
    (topologyName): {
      "nodes": {
        (nodeName): {
          "type": (nodeTypeName),

          "properties": {
            (nodeTypePropertyName): (any)
          },

          "deployment_artifacts": [
            (artifactName) | (artifactObject)
          ]
        }
      },

      "relationships": {
        (relationshipName): {
          "type":   (string),     # relationship type
          "source": (nodeName),
          "target": (nodeName)
        }
      }
    }
  }
}
```

Some parts are optional:

* `csar_name`
* `node_types.(nodeTypeName).properties_schema`
* `node_types.(nodeTypeName).properties_schema.(nodeTypePropertyName).default`
* `node_types.(nodeTypeName).properties_schema.(nodeTypePropertyName).input`
* `node_types.(nodeTypeName).properties_schema.(nodeTypePropertyName).output`
* `node_types.(nodeTypeName).operations`
* `node_types.(nodeTypeName).deployment_artifacts`
* `artifacts.(artifactName).wrap`
* `artifacts.(artifactName).properties`
* `artifacts.(artifactName).references`
* `topologies.(topologyName).nodes.(nodeName).properties`
* `topologies.(topologyName).nodes.(nodeName).deployment_artifacts`
* `topologies.(topologyName).relationships`

Additional information can be added such as custom namespaces, descriptions, and interfaces:

* `csar_namespace`
* `csar_description`
* `node_types.(nodeTypeName).description`
* `node_types.(nodeTypeName).namespace`
* `node_types.(nodeTypeName).properties_schema.(nodeTypePropertyName).description`
* `node_types.(nodeTypeName).interfaces.(interfaceName).implementation_artifacts` = `[ (artifactName) ]`
* `node_types.(nodeTypeName).interfaces.(interfaceName).operations.(operationName).implementation_artifacts` = `[ (artifactName) ]`
* `artifacts.(artifactName).description`
* `artifacts.(artifactName).namespace`
* `topologies.(topologyName).description`
* `topologies.(topologyName).namespace`

CSARs do not necessarily include topologies, but could also consist of node types or artifacts only.
Have a look at [csar-bricks](https://github.com/toscafy/csar-bricks) to see examples.
To inject XML snippets that define custom artifact types, relationship types, or XSD types, the following properties can optionally be added to the `csarspec.json` file:

``` plaintext
{
  ...
  "artifact_types_xml": [
    (string)   # XML snippet
  ],
  "relationship_types_xml":  [
    (string)   # XML snippet
  ],
  "xsd_types_xml": [
    (string)   # XML snippet
  ]
}
```



## Built-in types and functions

Please check the head of [lib/Generator.js](lib/Generator.js) to see which artifact types, relationship types, and functions are currently built into **toscafy**.

CSAR specs can refer to built-in functions provided by **toscafy**.
For example, the following artifact definition uses the `$toscafy.fetchAsFile` function to fetch a file and adds it to the generated CSAR:

``` plaintext
{
  "artifacts": {
    "apache_install": {
      "type": "script",
      "references": [
        { "$toscafy.fetchAsFile": "http://.../some-file.json", "filename": "fetched-file.json" },
        "./some-script.sh"
      ]
    }
  }
}
```

You could also embed the content of a file into the CSAR spec:

``` plaintext
{
  "artifacts": {
    "apache_install": {
      "type": "script",
      "properties": {
        "envVars": { "$toscafy.embedFileAsText": "./some-file.txt" }
      },
      "references": [
        "./some-script.sh"
      ]
    }
  }
}
```

Built-in functions can be included at any position in the `csarspec.json` file where an arbitrary value would be allowed.
Currently, the following built-in functions are provided:

* `$toscafy.addFile` adds a local file to the generated CSAR as `filename`
* `$toscafy.addDir` adds a local directory to the generated CSAR as `dirname`
* `$toscafy.addDirAsZip` adds a local directory (zip compressed) to the generated CSAR as `filename`
* `$toscafy.addDirAsTgz` adds a local directory (tar-gz compressed) to the generated CSAR as `filename`
* `$toscafy.fetchAsFile` fetches a remote file and adds it to the generated CSAR as `filename`
* `$toscafy.fetchAsText` fetches the content of a remote file and includes it in the CSAR spec as text
* `$toscafy.fetchAsJson` fetches the content (or a specific `part` of it, expressed as [_.get path](https://lodash.com/docs#get)) of a remote file and includes it in the CSAR spec as JSON
* `$toscafy.fetchAsBase64` fetches the content of a remote file and includes it in the CSAR spec as Base64 string
* `$toscafy.embedFileAsText` embeds the content of a local file into the CSAR spec as text
* `$toscafy.embedFileAsJson` embeds the content (or a specific `part` of it, expressed as [_.get path](https://lodash.com/docs#get)) of a local file into the CSAR spec as JSON
* `$toscafy.embedFileAsBase64` embeds the content of a local file into the CSAR spec as Base64 string
* `$toscafy.embedDirAsZipBase64` embeds the content of a local directory (zip compressed) into the CSAR spec as Base64 string
* `$toscafy.embedDirAsTgzBase64` embeds the content of a local directory (tar-gz compressed) into the CSAR spec as Base64 string
