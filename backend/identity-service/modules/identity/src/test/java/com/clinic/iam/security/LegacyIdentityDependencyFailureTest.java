package com.clinic.iam.security;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class LegacyIdentityDependencyFailureTest {
 private final Actor actor=new Actor(UUID.randomUUID(),Set.of("ROLE_PATIENT"),Instant.now());
 @Test void authenticationProviderFailureIsUnavailable()throws Exception{
  for(int status:new int[]{500,503,200}){
   var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
   server.createContext("/api/users/me",exchange->{byte[] body="invalid response".getBytes();exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(status,body.length);exchange.getResponseBody().write(body);exchange.close();});server.start();
   try{var client=new LegacyIdentityClient("http://127.0.0.1:"+server.getAddress().getPort());assertEquals(503,assertThrows(ResponseStatusException.class,()->client.current("Bearer synthetic",actor)).getStatusCode().value());}finally{server.stop(0);}
  }
 }
 @Test void authenticationProviderExplicitDenialStillInvalidatesSession()throws Exception{
  for(int status:new int[]{401,403}){
   var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/api/users/me",exchange->{exchange.sendResponseHeaders(status,-1);exchange.close();});server.start();
   try{assertFalse(new LegacyIdentityClient("http://127.0.0.1:"+server.getAddress().getPort()).current("Bearer synthetic",actor));}finally{server.stop(0);}
  }
 }
 @Test void filterDeniesWorkWith503DuringOutageAnd401ForRevokedSession()throws Exception{
  var tokens=mock(TokenVerifier.class);var legacy=mock(LegacyIdentityClient.class);var sessions=mock(SessionSecurityService.class);var chain=mock(jakarta.servlet.FilterChain.class);
  when(tokens.verify("Bearer synthetic")).thenReturn(actor);when(legacy.current("Bearer synthetic",actor)).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
  var filter=new UserAuthenticationFilter(tokens,legacy,sessions);var response=new MockHttpServletResponse();filter.doFilter(request(),response,chain);
  assertEquals(503,response.getStatus());assertTrue(response.getContentAsString().contains("DEPENDENCY_UNAVAILABLE"));verifyNoInteractions(chain,sessions);
  doReturn(false).when(legacy).current("Bearer synthetic",actor);response=new MockHttpServletResponse();filter.doFilter(request(),response,chain);assertEquals(401,response.getStatus());verifyNoInteractions(chain,sessions);
 }
 private MockHttpServletRequest request(){var req=new MockHttpServletRequest("GET","/api/me/current");req.addHeader("Authorization","Bearer synthetic");return req;}
}
