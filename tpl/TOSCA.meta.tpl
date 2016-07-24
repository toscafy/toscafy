TOSCA-Meta-Version: 1.0
CSAR-Version: 1.0
Created-By: toscafy
Entry-Definitions: Definitions/<%= definitionsFilename %>

Name: Definitions/<%= definitionsFilename %>
Content-Type: application/vnd.oasis.tosca.definitions

Name: schema/<%= propertiesFilename %>
Content-Type: text/xml

Name: csarspec.json
Content-Type: application/json

<% _.forEach(files, function(file) { if (!_.endsWith(file, '/')) { %>
Name: <%= file %>
Content-Type: application/octet-stream
<% } }); %>
