package com.clinic.iam.security;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
@Component
public class LegacyIdentityClient {
 private final RestClient client;
 public LegacyIdentityClient(@Value("${iam.security.legacy-identity-url}") String url){
  var f=new SimpleClientHttpRequestFactory();f.setConnectTimeout(Duration.ofSeconds(2));f.setReadTimeout(Duration.ofSeconds(2));
  client=RestClient.builder().baseUrl(url).requestFactory(f).build();
 }
 public boolean current(String bearer,Actor actor){
  try{
   Envelope e=client.get().uri("/api/users/me").header(HttpHeaders.AUTHORIZATION,bearer).retrieve().body(Envelope.class);
   return e!=null&&e.success()&&e.data()!=null&&actor.id().equals(e.data().id())&&"ACTIVE".equals(e.data().status())&&actor.roles().equals(e.data().roles());
  }catch(org.springframework.web.client.RestClientResponseException ex){
   if(ex.getStatusCode().value()==401||ex.getStatusCode().value()==403)return false;
   throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"Authentication verification unavailable",ex);
  }catch(Exception ex){throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"Authentication verification unavailable",ex);}
 }
 public record Envelope(boolean success,UserData data){}
 public Instant revokeSessions(String bearer){
  try{
   RevocationEnvelope e=client.post().uri("/api/auth/revoke-sessions").header(HttpHeaders.AUTHORIZATION,bearer).retrieve().body(RevocationEnvelope.class);
   if(e==null||!e.success()||e.data()==null)throw new IllegalStateException("Missing revocation acknowledgement");
   return e.data();
  }catch(Exception ex){throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"Unable to revoke sessions; retry the request",ex);}
 }
 public record RevocationEnvelope(boolean success,Instant data){}
 public record UserData(UUID id,String status,Set<String> roles){}
}
