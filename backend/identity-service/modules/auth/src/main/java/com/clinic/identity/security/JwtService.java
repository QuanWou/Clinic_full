package com.clinic.identity.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.Collection;
import java.util.Map;
import java.util.UUID;

@Service
public class JwtService {

    public static final String ACCESS = "access";
    public static final String REFRESH = "refresh";

    private final JwtProperties jwtProperties;
    private final SecretKey secretKey;

    public JwtService(JwtProperties jwtProperties) {
        this.jwtProperties = jwtProperties;
        this.secretKey = Keys.hmacShaKeyFor(jwtProperties.secret().getBytes(StandardCharsets.UTF_8));
    }

    public String generateAccessToken(UUID userId, String email, Object roles) {
        return generateAccessToken(userId, email, roles, null);
    }

    public String generateAccessToken(UUID userId, String email, Object roles, Instant validAfter) {
        Instant now = issuanceTime(validAfter);
        Instant expiry = now.plus(jwtProperties.accessTokenExpirationMinutes(), ChronoUnit.MINUTES);

        return Jwts.builder()
                .claims(Map.of(
                        "email", email,
                        "roles", roles
                ))
                .subject(userId.toString())
                .id(UUID.randomUUID().toString())
                .claim("token_type", ACCESS)
                // NumericDate iat is rounded to seconds by JWT serialization.
                // Keep the signed issuance instant for same-second revocation.
                .claim("auth_issued_at", now.toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(secretKey)
                .compact();
    }

    public String generateRefreshToken(UUID userId) {
        return generateRefreshToken(userId, null);
    }

    public String generateRefreshToken(UUID userId, Instant validAfter) {
        Instant now = issuanceTime(validAfter);
        Instant expiry = now.plus(jwtProperties.refreshTokenExpirationDays(), ChronoUnit.DAYS);

        return Jwts.builder()
                .subject(userId.toString())
                .id(UUID.randomUUID().toString())
                .claim("token_type", REFRESH)
                .claim("auth_issued_at", now.toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(secretKey)
                .compact();
    }

    private Instant issuanceTime(Instant validAfter) {
        Instant now = Instant.now();
        // Windows clock ticks can coincide with revocation. Wait for the next tick
        // instead of returning a newly logged-in session that is already invalid.
        for (int attempts = 0; validAfter != null && !now.isAfter(validAfter); attempts++) {
            if (attempts >= 50) throw new IllegalStateException("Account session clock is not ready; retry login");
            java.util.concurrent.locks.LockSupport.parkNanos(1_000_000);
            now = Instant.now();
        }
        return now;
    }

    public Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public UUID extractUserId(String token) {
        return UUID.fromString(extractAllClaims(token).getSubject());
    }

    /** Old JWTs fall back to iat; new JWTs retain precision within the same second. */
    public boolean issuedAfter(String token, Instant cutoff) {
        if (cutoff == null) return true;
        try {
            Claims claims = extractAllClaims(token);
            if (claims.getIssuedAt() == null) return false;
            Instant iat = claims.getIssuedAt().toInstant();
            String precise = claims.get("auth_issued_at", String.class);
            Instant issued = precise == null ? iat : Instant.parse(precise);
            return issued.truncatedTo(ChronoUnit.SECONDS).equals(iat.truncatedTo(ChronoUnit.SECONDS))
                    && !issued.isAfter(Instant.now()) && issued.isAfter(cutoff);
        } catch (RuntimeException ex) { return false; }
    }

    public boolean isAccessTokenValid(String token) {
        return isTokenValidForType(token, ACCESS);
    }

    public boolean isRefreshTokenValid(String token) {
        return isTokenValidForType(token, REFRESH);
    }

    private boolean isTokenValidForType(String token, String requiredType) {
        try {
            Claims claims = extractAllClaims(token);
            Date now = new Date();
            if (claims.getExpiration() == null || !claims.getExpiration().after(now)
                    || claims.getIssuedAt() == null || claims.getIssuedAt().after(now)
                    || !requiredType.equals(claims.get("token_type", String.class))) {
                return false;
            }
            String subject = claims.getSubject();
            if (subject == null || !UUID.fromString(subject).toString().equalsIgnoreCase(subject)) {
                return false;
            }
            if (ACCESS.equals(requiredType)) {
                Object email = claims.get("email");
                Object roles = claims.get("roles");
                return email instanceof String value && !value.isBlank()
                        && roles instanceof Collection<?> values && !values.isEmpty()
                        && values.stream().allMatch(role -> role instanceof String name && name.startsWith("ROLE_"));
            }
            return true;
        } catch (RuntimeException ex) {
            return false;
        }
    }
}
