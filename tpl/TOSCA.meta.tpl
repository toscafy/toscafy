TOSCA-Meta-Version: 1.0
CSAR-Version: 1.0
Created-By: TOSCAfy
Entry-Definitions: definitions.xml

Name: definitions.xml
Content-Type: application/vnd.oasis.tosca.definitions

Name: properties.xsd
Content-Type: text/xml

<% _.forEach(files, function(file) { %>
Name: <%= file %>
Content-Type: application/octet-stream
<% }); %>
