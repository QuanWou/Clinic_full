package com.clinic.doctor.security;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.time.Duration;
import java.util.*;

@Component
public class IdentityClient {
    private final RestClient client;
    public IdentityClient(@Value("${doctor.security.iam-url}") String url){
        var f=new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(Duration.ofSeconds(2));f.setReadTimeout(Duration.ofSeconds(2));
        client=RestClient.builder().baseUrl(url).requestFactory(f).build();
    }
    public Actor current(String bearer){
        if(bearer==null||!bearer.startsWith("Bearer "))return null;
        try{
            CurrentActor me=client.get().uri("/api/me/current")
                .header(HttpHeaders.AUTHORIZATION,bearer).retrieve().body(CurrentActor.class);
            if(me==null||me.userId()==null||me.legacyRoles()==null||me.legacyRoles().isEmpty()) return null;
            return new Actor(me.userId(),Set.copyOf(me.legacyRoles()));
        }catch(org.springframework.web.client.RestClientResponseException ex){
            if(ex.getStatusCode().value()==401||ex.getStatusCode().value()==403)return null;
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"Identity verification unavailable",ex);
        }catch(Exception ex){
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"Identity verification unavailable",ex);
        }
    }
    public record CurrentActor(UUID userId,Set<String> legacyRoles,boolean platformOperator){}
}
