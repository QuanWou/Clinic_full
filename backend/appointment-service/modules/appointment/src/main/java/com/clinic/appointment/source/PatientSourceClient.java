package com.clinic.appointment.source;
import com.clinic.appointment.api.ApiProblem;
import com.clinic.appointment.security.WorkloadTokenIssuer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.time.Duration;
import java.util.UUID;

@Component
public class PatientSourceClient{
 private final RestClient client;private final WorkloadTokenIssuer tokens;
 public PatientSourceClient(@Value("${appointment.security.patient-url}") String url,WorkloadTokenIssuer tokens){
  var f=new SimpleClientHttpRequestFactory();f.setConnectTimeout(Duration.ofSeconds(2));f.setReadTimeout(Duration.ofSeconds(2));
  client=RestClient.builder().baseUrl(url).requestFactory(f).build();this.tokens=tokens;
 }
 public BookingIdentity booking(UUID patientId){
  try{
   BookingIdentity x=client.get().uri("/api/internal/patients/{id}/booking-identity",patientId)
    .header(HttpHeaders.AUTHORIZATION,tokens.bearer("patient-service","patient.booking.read")).retrieve().body(BookingIdentity.class);
   if(x==null||!patientId.equals(x.patientId())||x.platformUserId()==null||!x.active())throw ApiProblem.forbidden();return x;
  }catch(ApiProblem e){throw e;}catch(org.springframework.web.client.RestClientResponseException e){
   if(e.getStatusCode().value()==404)throw ApiProblem.forbidden();
   throw ApiProblem.dependency("Patient booking identity source unavailable");
  }catch(Exception e){throw ApiProblem.dependency("Patient booking identity source unavailable");}
 }
 public ClinicLink clinicLink(UUID patientId,UUID clinicId){
  try{
   ClinicLink x=client.post().uri("/api/internal/patients/{patientId}/clinic-links/{clinicId}",patientId,clinicId)
    .header(HttpHeaders.AUTHORIZATION,tokens.bearer("patient-service","patient.booking.read")).retrieve().body(ClinicLink.class);
   if(x==null||!clinicId.equals(x.clinicId())||!patientId.equals(x.patientId())||x.id()==null||!"VERIFIED".equals(x.status()))throw ApiProblem.invalid("Patient clinic link is not verified");return x;
  }catch(ApiProblem e){throw e;}catch(org.springframework.web.client.RestClientResponseException e){
   if(e.getStatusCode().value()==404)throw ApiProblem.missing();
   if(e.getStatusCode().value()==409)throw ApiProblem.conflict("Patient clinic link requires review");
   throw ApiProblem.dependency("Patient clinic link source unavailable");
  }catch(Exception e){throw ApiProblem.dependency("Patient clinic link source unavailable");}
 }
 public record BookingIdentity(UUID patientId,UUID platformUserId,boolean active){}
 public record ClinicLink(UUID id,UUID clinicId,UUID patientId,String patientCode,String status,long version){}
}
