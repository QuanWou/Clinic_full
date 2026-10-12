package com.clinic.iam.api;

import com.clinic.iam.security.*;
import com.clinic.iam.service.MembershipService;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MembershipSessionControllerTest {
    @Test void mirrorsIdentityCutoffOnlyAfterAcknowledgement() {
        var identity = mock(LegacyIdentityClient.class);
        var sessions = mock(SessionSecurityService.class);
        var controller = new MembershipController(mock(MembershipService.class), sessions, identity);
        var actor = new Actor(UUID.randomUUID(), Set.of("ROLE_PATIENT"), Instant.now());
        var cutoff = Instant.now();
        when(identity.revokeSessions("Bearer token")).thenReturn(cutoff);
        when(sessions.revokeBefore(actor.id(), cutoff)).thenReturn(2L);
        var response = controller.revokeCurrent(actor, "Bearer token");
        var ordered = inOrder(identity, sessions);
        ordered.verify(identity).revokeSessions("Bearer token");
        ordered.verify(sessions).revokeBefore(actor.id(), cutoff);
        assertEquals(cutoff, response.invalidBefore());
    }

    @Test void unavailableAuthenticationCannotReportSuccessfulRevocation() {
        var identity = mock(LegacyIdentityClient.class);
        var sessions = mock(SessionSecurityService.class);
        var controller = new MembershipController(mock(MembershipService.class), sessions, identity);
        var actor = new Actor(UUID.randomUUID(), Set.of("ROLE_PATIENT"), Instant.now());
        when(identity.revokeSessions("Bearer token")).thenThrow(new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE));
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> controller.revokeCurrent(actor, "Bearer token"));
        verifyNoInteractions(sessions);
    }
}
