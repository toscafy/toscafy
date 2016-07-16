<?xml version="1.0" encoding="UTF-8"?>
<tosca:Definitions xmlns:tosca="http://docs.oasis-open.org/tosca/ns/2011/12" xmlns:winery="http://www.opentosca.org/winery/extensions/tosca/2013/02/12" xmlns:selfservice="http://www.eclipse.org/winery/model/selfservice" id="<%= spec.csar_name %>" xmlns:tns="<%= spec.csar_namespace %>" targetNamespace="<%= spec.csar_namespace %>">

  <!-- ============== -->
  <!-- Artifact Types -->
  <!-- ============== -->

  <% _.forEach(artifactTypes, function(at) { %>
  <tosca:ArtifactType name="<%= at.name %>" targetNamespace="<%= at.namespace %>"/>
  <% }); %>

  <% if (spec.artifact_types_xml) { %>
  <%= spec.artifact_types_xml %>
  <% } %>

  <!-- ================== -->
  <!-- Relationship Types -->
  <!-- ================== -->

  <% _.forEach(relationshipTypes, function(rt) { %>
  <tosca:RelationshipType name="<%= rt.name %>" targetNamespace="<%= rt.name %>"/>
  <% }); %>

  <% if (spec.relationship_types_xml) { %>
  <%= spec.relationship_types_xml %>
  <% } %>

  <!-- ========== -->
  <!-- Node Types -->
  <!-- ========== -->

  <tosca:Import namespace="<%= spec.csar_namespace %>" location="./properties.xsd" importType="http://www.w3.org/2001/XMLSchema"/>

  <% _.forEach(spec.node_types, function(nt, ntName) { %>
  <tosca:NodeType name="<%= ntName %>">
    <% if (!_.isEmpty(nt.properties_schema)) { %>
    <winery:PropertiesDefinition elementname="<%= ntName %>Properties" namespace="<%= spec.csar_namespace %>">
      <% _.forEach(nt.properties_schema, function(p, pName) { %>
      <winery:properties>
        <winery:key><%= pName %></winery:key>
        <winery:type><%= p.type %></winery:type>
      </winery:properties>
      <% }); %>
    </winery:PropertiesDefinition>
    <% } %>
    <tosca:PropertiesDefinition type="tns:MySQLDBProperties"/>
    <% if (!_.isEmpty(nt.interfaces)) { %>
    <tosca:Interfaces>
      <% _.forEach(nt.interfaces, function(iface, ifaceName) { %>
      <tosca:Interface name="<%= ifaceName %>">
        <% _.forEach(iface.operations, function(op, opName) { %>
        <tosca:Operation name="<%= opName %>">
          <tosca:InputParameters>
            <% _.forEach(nt.properties_schema, function(p, pName) { %>
            <tosca:InputParameter name="<%= pName %>" type="<%= p.type %>"/> <!-- required="yes" -->
            <% }); %>
          </tosca:InputParameters>
          <tosca:OutputParameters>
            <tosca:OutputParameter name="logs" type="xsd:string"/>
          </tosca:OutputParameters>
        </tosca:Operation>
        <% }); %>
      </tosca:Interface>
      <% }); %>
    </tosca:Interfaces>
    <% } %>
  </tosca:NodeType>


  <% if (nt.has_implementation_artifacts || !_.isEmpty(nt.deployment_artifacts)) { %>
  <tosca:NodeTypeImplementation name="<%= ntName %>Impl" nodeType="tns:<%= ntName %>">
    <% if (nt.has_implementation_artifacts) { %>
    <tosca:ImplementationArtifacts>
      <% _.forEach(nt.interfaces, function(iface, ifaceName) { %>
      <% if (iface.implementation_artifacts) { %>
      <% _.forEach(iface.implementation_artifacts, function(ia) { %>
      <tosca:ImplementationArtifact xmlns:ia="<%= ia.namespace %>" name="IA-<%= ia.name %>" interfaceName="<%= ifaceName %>" artifactType="ia:<%= ia.type %>" artifactRef="tns:<%= ia.name %>"/>
      <% }); %>
      <% } %>
      <% _.forEach(iface.operations, function(op, opName) { %>
      <% if (op.implementation_artifacts) { %>
      <% _.forEach(op.implementation_artifacts, function(ia) { %>
      <tosca:ImplementationArtifact xmlns:ia="<%= ia.namespace %>" name="IA-<%= opName %>-<%= ia.name %>" interfaceName="<%= ifaceName %>" operationName="<%= opName %>" artifactType="ia:<%= ia.type %>" artifactRef="tns:<%= ia.name %>"/>
      <% }); %>
      <% } %>
      <% }); %>
      <% }); %>
    </tosca:ImplementationArtifacts>
    <% } %>
    <% if (!_.isEmpty(nt.deployment_artifacts)) { %>
    <tosca:DeploymentArtifacts>
      <% _.forEach(nt.deployment_artifacts, function(da) { %>
      <tosca:DeploymentArtifact xmlns:da="<%= da.namespace %>" name="DA-<%= da.name %>" artifactType="da:<%= da.type %>" artifactRef="tns:<%= da.name %>"/>
      <% }); %>
    </tosca:DeploymentArtifacts>
    <% } %>
  </tosca:NodeTypeImplementation>
  <% } %>
  <% }); %>

  <!-- ================== -->
  <!-- Artifact Templates -->
  <!-- ================== -->

  <% _.forEach(spec.artifacts, function(art, artName) { %>
  <tosca:ArtifactTemplate xmlns:at="<%= art.namespace %>" xmlns="<%= art.namespace %>" id="<%= artName %>" type="at:<%= art.type %>">
    <% if (!_.isEmpty(art.properties)) { %>
    <tosca:Properties>
      <% if ('WAR' === art.type) { %>
      <ot:WSProperties xmlns:ot="http://www.uni-stuttgart.de/opentosca" xmlns="http://www.uni-stuttgart.de/opentosca">
        <% _.forEach(art.properties, function(pValue, pName) { %>
        <<%= pName %>><%= pValue %></<%= pName %>>
        <% }); %>
      </ot:WSProperties>
      <% } else { %>
      <% _.forEach(art.properties, function(pValue, pName) { %>
      <<%= pName %>><%= pValue %></<%= pName %>>
      <% }); %>
      <% } %>
    </tosca:Properties>
    <% } %>
    <% if (_.includes(['ScriptArtifact', 'WAR'], art.type) && !_.isEmpty(art.references)) { %>
    <tosca:ArtifactReferences>
      <% _.forEach(art.references, function(ref) { %>
      <tosca:ArtifactReference reference="<%= ref %>"/>
      <% }); %>
    </tosca:ArtifactReferences>
    <% } %>
    <% _.forEach(art, function(value, name) { %>
    <% if (!_.includes(['type', 'namespace', 'name', 'references', 'properties'], name)) { %>
    <<%= name %>><%= value %></<%= name %>>
    <% } %>
    <% }); %>
  </tosca:ArtifactTemplate>
  <% }); %>

  <!-- ============================ -->
  <!-- Service & Topology Templates -->
  <!-- ============================ -->

  <% _.forEach(spec.topologies, function(top, topName) { %>
  <tosca:ServiceTemplate id="<%= topName %>" name="<%= topName %>">
    <tosca:TopologyTemplate>
      <% _.forEach(top.nodes, function(n, nName) { %>
      <tosca:NodeTemplate name="<%= nName %>" minInstances="1" maxInstances="1" id="<%= nName %>" type="tns:<%= n.type %>">
        <% if (!_.isEmpty(n.properties)) { %>
        <tosca:Properties>
          <tns:<%= n.type %>Properties xmlns="<%= spec.csar_namespace %>">
            <% _.forEach(n.properties, function(pValue, pName) { %>
            <<%= pName %>><%= pValue %></<%= pName %>>
            <% }); %>
          </tns:<%= n.type %>Properties>
        </tosca:Properties>
        <% } %>
        <% if (!_.isEmpty(n.deployment_artifacts)) { %>
        <tosca:DeploymentArtifacts>
          <% _.forEach(n.deployment_artifacts, function(da) { %>
          <tosca:DeploymentArtifact xmlns:da="<%= da.namespace %>" name="DA-<%= da.name %>" artifactType="da:<%= da.type %>" artifactRef="tns:<%= da.name %>"/>
          <% }); %>
        </tosca:DeploymentArtifacts>
        <% } %>
      </tosca:NodeTemplate>
      <% }); %>
      <% _.forEach(top.relationships, function(r, rName) { %>
      <tosca:RelationshipTemplate xmlns:rt="<%= r.namespace %>" name="<%= rName %>" id="<%= rName %>" type="rt:<%= r.type %>">
        <tosca:SourceElement ref="<%= r.source %>"/>
        <tosca:TargetElement ref="<%= r.target %>"/>
      </tosca:RelationshipTemplate>
      <% }); %>
    </tosca:TopologyTemplate>
  </tosca:ServiceTemplate>
  <% }); %>

</tosca:Definitions>
