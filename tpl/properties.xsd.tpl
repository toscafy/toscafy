<?xml version="1.0" encoding="UTF-8"?>
<schema attributeFormDefault="unqualified" elementFormDefault="qualified" targetNamespace="<%= csarspec.csar_namespace %>" xmlns:csar="<%= csarspec.csar_namespace %>" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="http://www.w3.org/2001/XMLSchema">

  <!-- <element name="ArtifactProperties">
    <complexType>
      <sequence>
        <any minOccurs="0" maxOccurs="unbounded" namespace="##targetNamespace"/>
      </sequence>
    </complexType>
  </element> -->

  <% _.forEach(csarspec.node_types, function(nt, ntName) { %>
  <% if (!_.isEmpty(nt.properties_schema)) { %>
  <element name="<%= ntName %>_Properties">
    <complexType>
      <sequence>
        <% _.forEach(nt.properties_schema, function(p, pName) { %>
        <element name="<%= pName %>" type="<%= p.type %>" <% if (p.default && _.isString(p.default)) { %>default="<%= p.default %>"<% } %> minOccurs="0" maxOccurs="1">
          <% if (p.doc) { %>
          <annotation>
            <documentation><%= p.doc %></documentation>
          </annotation>
          <% } %>
        </element>
        <% }); %>
        <any minOccurs="0" maxOccurs="unbounded" namespace="##targetNamespace"/>
      </sequence>
    </complexType>
  </element>
  <% } %>
  <% }); %>

  <% if (csarspec.xsd_types_xml) { %>
  <%= csarspec.xsd_types_xml %>
  <% } %>

</schema>
