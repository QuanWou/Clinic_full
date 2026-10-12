package com.clinic.encounter.api;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class StreamingErrorResponseTest {
 @RestController static class Probe {
  @GetMapping(value="/api/me/probe/events",produces="text/event-stream")
  SseEmitter events(@RequestParam boolean denied){if(denied)throw ApiProblem.forbidden();throw ApiProblem.dependency("Patient ownership source unavailable");}
 }
 @Test void dependencyErrorRemains503JsonForStreamingClient()throws Exception{
  MockMvcBuilders.standaloneSetup(new Probe()).setControllerAdvice(new ApiErrorHandler()).build().perform(get("/api/me/probe/events?denied=false").accept("text/event-stream"))
   .andExpect(status().isServiceUnavailable()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)).andExpect(jsonPath("$.error.code").value("DEPENDENCY_UNAVAILABLE"));
 }
 @Test void ownershipDenialRemains403JsonForStreamingClient()throws Exception{
  MockMvcBuilders.standaloneSetup(new Probe()).setControllerAdvice(new ApiErrorHandler()).build().perform(get("/api/me/probe/events?denied=true").accept("text/event-stream"))
   .andExpect(status().isForbidden()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)).andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
 }
}
