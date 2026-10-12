package com.clinic.catalog.security;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class IdentityDependencyFailureTest {
 @Test void providerErrorsAndBrokenResponsesStayUnavailable()throws Exception{
  for(int status:new int[]{500,503,200}){
   var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
   server.createContext("/api/me/current",exchange->{byte[] body="invalid response".getBytes();exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(status,body.length);exchange.getResponseBody().write(body);exchange.close();});server.start();
   try{var client=new IdentityClient("http://127.0.0.1:"+server.getAddress().getPort());assertEquals(503,assertThrows(ResponseStatusException.class,()->client.current("Bearer synthetic")).getStatusCode().value());}finally{server.stop(0);}
  }
  var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);int port=server.getAddress().getPort();server.stop(0);
  assertEquals(503,assertThrows(ResponseStatusException.class,()->new IdentityClient("http://127.0.0.1:"+port).current("Bearer synthetic")).getStatusCode().value());
 }
 @Test void actualAuthenticationDenialIsNotRetriedAsProviderFailure()throws Exception{
  for(int status:new int[]{401,403}){
   var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/api/me/current",exchange->{exchange.sendResponseHeaders(status,-1);exchange.close();});server.start();
   try{var client=new IdentityClient("http://127.0.0.1:"+server.getAddress().getPort());assertNull(client.current("Bearer synthetic"));assertNull(client.current(null));}finally{server.stop(0);}
  }
 }
 @Test void filterBlocksProtectedWorkWithoutDestroyingAValidSession()throws Exception{
  var client=mock(IdentityClient.class);var chain=mock(jakarta.servlet.FilterChain.class);var filter=new ApiAuthenticationFilter(client);
  var request=new MockHttpServletRequest("GET","/api/protected");request.addHeader("Authorization","Bearer synthetic");var response=new MockHttpServletResponse();
  when(client.current("Bearer synthetic")).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));filter.doFilter(request,response,chain);
  assertEquals(503,response.getStatus());assertTrue(response.getContentAsString().contains("DEPENDENCY_UNAVAILABLE"));verifyNoInteractions(chain);
  doReturn(null).when(client).current("Bearer synthetic");response=new MockHttpServletResponse();filter.doFilter(newRequest(),response,chain);assertEquals(401,response.getStatus());verifyNoInteractions(chain);
 }
 private MockHttpServletRequest newRequest(){var request=new MockHttpServletRequest("GET","/api/protected");request.addHeader("Authorization","Bearer synthetic");return request;}
}
