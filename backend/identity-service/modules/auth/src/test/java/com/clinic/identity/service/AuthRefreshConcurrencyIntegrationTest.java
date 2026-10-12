package com.clinic.identity.service;

import com.clinic.common.constants.ErrorCode;
import com.clinic.common.exception.BusinessException;
import com.clinic.identity.dto.RefreshTokenRequest;
import com.clinic.identity.entity.RefreshToken;
import com.clinic.identity.entity.RoleCode;
import com.clinic.identity.entity.User;
import com.clinic.identity.entity.UserStatus;
import com.clinic.identity.repository.RefreshTokenRepository;
import com.clinic.identity.repository.RoleRepository;
import com.clinic.identity.repository.UserRepository;
import com.clinic.identity.security.JwtService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDateTime;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Uses the isolated clinic_security_test DB only, and never the clinic_db application database. */
@SpringBootTest(properties = {
        "spring.jpa.properties.hibernate.default_schema=identity",
        "spring.flyway.schemas=identity",
        "spring.flyway.default-schema=identity"
})
@EnabledIfEnvironmentVariable(named = "CLINIC_SECURITY_TEST_DB", matches = "true")
class AuthRefreshConcurrencyIntegrationTest {
    @org.springframework.test.context.DynamicPropertySource
    static void isolatedDatabase(org.springframework.test.context.DynamicPropertyRegistry registry) {
        String url = System.getenv("AUTH_IT_JDBC_URL");
        if (url == null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/clinic_security_test"))
            throw new IllegalStateException("Authentication integration tests require the isolated clinic_security_test database");
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("AUTH_IT_USER"));
        registry.add("spring.datasource.password", () -> System.getenv("AUTH_IT_PASSWORD"));
        registry.add("spring.flyway.locations", () -> "classpath:modules/auth/db/migration");
    }
    @Autowired AuthService auth;
    @Autowired JwtService jwt;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired RefreshTokenRepository tokens;
    @Autowired JdbcTemplate jdbc;

    private UUID createdUserId;

    private com.clinic.identity.dto.AuthResponse registeredAccount() {
        String email = "security-" + UUID.randomUUID() + "@example.test";
        var response = auth.register(new com.clinic.identity.dto.RegisterRequest(email, "Security123!", "Security regression", null));
        createdUserId = response.userId();
        return response;
    }

    @Test
    void registrationReturnsGeneratedCodeAndEmailIsCaseInsensitive() {
        var original = registeredAccount();
        org.junit.jupiter.api.Assertions.assertNotNull(original.accountCode());
        assertEquals(original.accountCode(), users.findById(createdUserId).orElseThrow().getAccountCode());
        var login = auth.login(new com.clinic.identity.dto.LoginRequest(original.email().toUpperCase(java.util.Locale.ROOT), "Security123!"));
        assertEquals(createdUserId, login.userId());
        var ex = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
                () -> auth.register(new com.clinic.identity.dto.RegisterRequest(original.email().toUpperCase(java.util.Locale.ROOT), "Security123!", "Duplicate", null)));
        assertEquals(ErrorCode.CONFLICT, ex.getErrorCode());
    }

    @Test
    void revokedSessionCannotRefreshButNewLoginWorks() {
        var old = registeredAccount();
        var actor = new com.clinic.identity.security.CurrentUserPrincipal(createdUserId, old.email(), old.fullName(), old.roles());
        var cutoff = auth.revokeSessions(actor);
        org.junit.jupiter.api.Assertions.assertFalse(jwt.issuedAfter(old.accessToken(), cutoff));
        org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class, () -> auth.refresh(new RefreshTokenRequest(old.refreshToken())));
        var fresh = auth.login(new com.clinic.identity.dto.LoginRequest(old.email(), "Security123!"));
        assertTrue(jwt.issuedAfter(fresh.accessToken(), users.findById(createdUserId).orElseThrow().getTokensInvalidBefore()));
        assertTrue(jwt.issuedAfter(fresh.refreshToken(), cutoff));
    }

    @Test
    void concurrentRefreshAndRevokeLeaveNoSurvivingSession() throws Exception {
        var old = registeredAccount();
        var actor = new com.clinic.identity.security.CurrentUserPrincipal(createdUserId, old.email(), old.fullName(), old.roles());
        CountDownLatch start = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var rotation = workers.submit(() -> {start.await();try {return auth.refresh(new RefreshTokenRequest(old.refreshToken()));}catch(BusinessException ex){assertEquals(ErrorCode.UNAUTHORIZED, ex.getErrorCode());return null;}});
            var revocation = workers.submit(() -> {start.await();return auth.revokeSessions(actor);});
            start.countDown();
            var rotated = rotation.get(30, TimeUnit.SECONDS);
            var cutoff = revocation.get(30, TimeUnit.SECONDS);
            if (rotated != null) org.junit.jupiter.api.Assertions.assertFalse(jwt.issuedAfter(rotated.accessToken(), cutoff));
            assertEquals(0, jdbc.queryForObject("select count(*) from identity.refresh_tokens where user_id=? and revoked=false", Integer.class, createdUserId));
        }
    }

    @AfterEach
    void cleanupOnlyCreatedTestUser() {
        if (createdUserId != null) {
            jdbc.update("DELETE FROM identity.refresh_tokens WHERE user_id = ?", createdUserId);
            jdbc.update("DELETE FROM identity.user_roles WHERE user_id = ?", createdUserId);
            jdbc.update("DELETE FROM identity.users WHERE id = ?", createdUserId);
        }
    }

    @Test
    void concurrentRefreshRequestsCannotReuseSameRefreshToken() throws Exception {
        User user = new User();
        createdUserId = UUID.randomUUID();
        user.setId(createdUserId);
        user.setEmail("security-" + createdUserId + "@example.test");
        user.setPasswordHash("unused-test-password-hash");
        user.setFullName("Refresh Test");
        user.setStatus(UserStatus.ACTIVE);
        user.setCreatedAt(LocalDateTime.now());
        user.setUpdatedAt(LocalDateTime.now());
        user.setRoles(Set.of(roles.findByCode(RoleCode.ROLE_PATIENT).orElseThrow()));
        users.saveAndFlush(user);

        String original = jwt.generateRefreshToken(createdUserId);
        RefreshToken stored = new RefreshToken();
        stored.setId(UUID.randomUUID());
        stored.setUser(user);
        stored.setToken(original);
        stored.setExpiresAt(LocalDateTime.now().plusDays(1));
        stored.setCreatedAt(LocalDateTime.now());
        stored.setRevoked(false);
        tokens.saveAndFlush(stored);

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            Future<String> one = workers.submit(() -> refreshAtOnce(original, ready, start));
            Future<String> two = workers.submit(() -> refreshAtOnce(original, ready, start));
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            assertEquals(Set.of("ROTATED", "REJECTED"), Set.of(
                    one.get(30, TimeUnit.SECONDS), two.get(30, TimeUnit.SECONDS)));
        }
        assertTrue(tokens.findByToken(original).orElseThrow().getRevoked());
        Integer active = jdbc.queryForObject(
                "SELECT count(*) FROM identity.refresh_tokens WHERE user_id=? AND revoked=false",
                Integer.class, createdUserId);
        assertEquals(1, active);
    }

    private String refreshAtOnce(String token, CountDownLatch ready, CountDownLatch start) throws Exception {
        ready.countDown();
        if (!start.await(10, TimeUnit.SECONDS)) {
            throw new IllegalStateException("Concurrent refresh did not start");
        }
        try {
            var result = auth.refresh(new RefreshTokenRequest(token));
            assertTrue(jwt.isAccessTokenValid(result.accessToken()));
            return "ROTATED";
        } catch (BusinessException ex) {
            if (ErrorCode.UNAUTHORIZED.equals(ex.getErrorCode())) {
                return "REJECTED";
            }
            throw ex;
        }
    }
}
