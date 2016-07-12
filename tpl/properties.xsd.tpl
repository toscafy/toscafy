<?xml version="1.0" encoding="UTF-8"?>
<schema attributeFormDefault="unqualified" elementFormDefault="qualified" targetNamespace="http://toscafy.github.io/nodetypes" xmlns:tns="http://toscafy.github.io/nodetypes" xmlns="http://www.w3.org/2001/XMLSchema">

  <% if (spec.node_types) _.forEach(spec.node_types), function(nt, ntName) { %>
  <element name="<%= ntName %>Properties">
    <complexType>
      <sequence xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <% if (nt.properties_schema) _.forEach(nt.properties_schema), function(p, pName) { %>
        <element name="<%= pName %>" type="<%= p.type %>" <% if (p.default) { %>default="<%= p.default %>"<% } %> minOccurs="0" maxOccurs="1"/>
        <% }); %>
        <any minOccurs="0" maxOccurs="unbounded" namespace="##targetNamespace"/>
      </sequence>
    </complexType>
  </element>
  <% }); %>

  <% if (spec.xml_types) { %>
  <%= spec.xml_types %>
  <% } %>
</schema>
