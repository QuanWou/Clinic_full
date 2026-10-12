package com.clinic.appointment.source;
import com.clinic.appointment.api.ApiProblem;
import com.clinic.appointment.security.WorkloadTokenIssuer;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class BookingSourceDependencyFailureTest {
 @Test void patientProviderFailureDoesNotBecomeOwnershipDenial()throws Exception{
  for(int status:new int[]{500,503}){
   var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/api/internal/",exchange->{exchange.sendResponseHeaders(status,-1);exchange.close();});server.start();
   try{var tokens=mock(WorkloadTokenIssuer.class);when(tokens.bearer(anyString(),anyString())).thenReturn("Bearer synthetic");var client=new PatientSourceClient("http://127.0.0.1:"+server.getAddress().getPort(),tokens);
    assertEquals(503,assertThrows(ApiProblem.class,()->client.booking(UUID.randomUUID())).status.value());assertEquals(503,assertThrows(ApiProblem.class,()->client.clinicLink(UUID.randomUUID(),UUID.randomUUID())).status.value());
   }finally{server.stop(0);}
  }
 }
 @Test void clinicProviderFailureDoesNotBecomeSlotConflict()throws Exception{
  var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/api/internal/",exchange->{exchange.sendResponseHeaders(503,-1);exchange.close();});server.start();
  try{var tokens=mock(WorkloadTokenIssuer.class);when(tokens.bearer(anyString(),anyString())).thenReturn("Bearer synthetic");var client=new ClinicSourceClient("http://127.0.0.1:"+server.getAddress().getPort(),tokens);
   assertEquals(503,assertThrows(ApiProblem.class,()->client.requireEligible(UUID.randomUUID(),UUID.randomUUID())).status.value());
  }finally{server.stop(0);}
 }
}
