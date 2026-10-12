package com.clinic.patient.security;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.time.Duration;
import java.util.*;
@Component
public class IdentityClient{
 private final RestClient client;
 public IdentityClient(@Value("${patient.security.identity-url}") String url){
  var f=new SimpleClientHttpRequestFactory();f.setConnectTimeout(Duration.ofSeconds(2));f.setReadTimeout(Duration.ofSeconds(2));
  client=RestClient.builder().baseUrl(url).requestFactory(f).build();
 }
 public Actor current(String bearer){
        if(bearer==null||!bearer.startsWith("Bearer "))return null;
  try{
   Current c=client.get().uri("/api/me/current").header(HttpHeaders.AUTHORIZATION,bearer).retrieve().body(Current.class);
   return c==null?null:new Actor(c.userId(),c.legacyRoles()==null?Set.of():Set.copyOf(c.legacyRoles()));
  }catch(org.springframework.web.client.RestClientResponseException ex){
            if(ex.getStatusCode().value()==401||ex.getStatusCode().value()==403)return null;
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"Identity verification unavailable",ex);
        }catch(Exception ex){
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"Identity verification unavailable",ex);
        }
 }
 record Current(UUID userId,Set<String> legacyRoles,boolean platformOperator){}
}
