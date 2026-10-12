package com.clinic.identity.service;

import com.clinic.common.constants.ErrorCode;
import com.clinic.common.exception.BusinessException;
import com.clinic.identity.dto.*;
import com.clinic.identity.entity.*;
import com.clinic.identity.repository.RefreshTokenRepository;
import com.clinic.identity.repository.RoleRepository;
import com.clinic.identity.repository.UserRepository;
import com.clinic.identity.security.CurrentUserPrincipal;
import com.clinic.identity.security.JwtProperties;
import com.clinic.identity.security.JwtService;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final JwtProperties jwtProperties;

    public AuthService(UserRepository userRepository,
                       RoleRepository roleRepository,
                       RefreshTokenRepository refreshTokenRepository,
                       PasswordEncoder passwordEncoder,
                       AuthenticationManager authenticationManager,
                       JwtService jwtService,
                       JwtProperties jwtProperties) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.jwtProperties = jwtProperties;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (userRepository.existsByEmail(email)) {
            throw new BusinessException(ErrorCode.CONFLICT, "Email already exists");
        }

        Role patientRole = roleRepository.findByCode(RoleCode.ROLE_PATIENT)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Default role not found"));

        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setFullName(request.fullName());
        user.setPhone(request.phone());
        user.setStatus(UserStatus.ACTIVE);
        user.setCreatedAt(LocalDateTime.now());
        user.setUpdatedAt(LocalDateTime.now());
        user.getRoles().add(patientRole);

        user = userRepository.save(user);
        // Flush before returning DB-generated accountCode in the registration response.
        userRepository.flush();

        return buildAuthResponse(user);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        User found = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED, "Invalid credentials"));
        User user = userRepository.findLockedById(found.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED, "Invalid credentials"));
        // Serialize login with password/status changes and session revocation.
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.email(), request.password())
        );

        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "Account is not active");
        }

        return buildAuthResponse(user);
    }

    @Transactional
    public AuthResponse refresh(RefreshTokenRequest request) {
        RefreshToken refreshToken = validatedRefreshToken(request.refreshToken());
        User user = refreshToken.getUser();
        refreshToken.setRevoked(true);
        refreshTokenRepository.save(refreshToken);

        return buildAuthResponse(user);
    }

    @Transactional
    public void logout(RefreshTokenRequest request) {
        RefreshToken refreshToken = validatedRefreshToken(request.refreshToken());
        refreshToken.setRevoked(true);
        refreshTokenRepository.save(refreshToken);
    }

    @Transactional
    public Instant revokeSessions(CurrentUserPrincipal actor) {
        User user = userRepository.findLockedById(actor.id())
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED, "Account unavailable"));
        Instant cutoff = Instant.now();
        if (user.getTokensInvalidBefore() != null && cutoff.isBefore(user.getTokensInvalidBefore()))
            cutoff = user.getTokensInvalidBefore();
        user.setTokensInvalidBefore(cutoff);
        refreshTokenRepository.revokeAllByUserId(user.getId());
        return cutoff;
    }

    private RefreshToken validatedRefreshToken(String tokenValue) {
        // A signature alone is not enough: an access token must never enter the refresh workflow.
        if (!jwtService.isRefreshTokenValid(tokenValue)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "Invalid refresh token");
        }
        UUID subject;
        try {
            subject = jwtService.extractUserId(tokenValue);
        } catch (RuntimeException ex) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "Invalid refresh token subject");
        }
        // Always lock the account before the token, matching revoke/reset lock order.
        // This prevents a refresh racing revocation from issuing a surviving token.
        User current = userRepository.findLockedById(subject)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED, "Account unavailable"));
        RefreshToken stored = refreshTokenRepository.findByTokenForUpdate(tokenValue)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED, "Refresh token not found"));
        User user = stored.getUser();
        if (user == null || user.getId() == null || !subject.equals(user.getId())
                || Boolean.TRUE.equals(stored.getRevoked()) || stored.getExpiresAt() == null
                || !stored.getExpiresAt().isAfter(LocalDateTime.now())
                || current.getStatus() != UserStatus.ACTIVE
                || (current.getTokensInvalidBefore() != null && !jwtService.issuedAfter(tokenValue, current.getTokensInvalidBefore()))) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "Refresh token expired, revoked or account inactive");
        }
        stored.setUser(current);
        return stored;
    }

    @Transactional(readOnly = true)
    public UserMeResponse me(CurrentUserPrincipal currentUser) {
        User user = userRepository.findById(currentUser.id())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "User not found"));

        return new UserMeResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getPhone(),
                user.getStatus(),
                user.getRoles().stream()
                        .map(role -> role.getCode().name())
                        .collect(Collectors.toSet()),
                user.getAccountCode()
        );
    }

    private AuthResponse buildAuthResponse(User user) {
        Set<String> roles = user.getRoles().stream()
                .map(role -> role.getCode().name())
                .collect(Collectors.toSet());

        String accessToken = jwtService.generateAccessToken(user.getId(), user.getEmail(), roles, user.getTokensInvalidBefore());
        String refreshTokenValue = jwtService.generateRefreshToken(user.getId(), user.getTokensInvalidBefore());

        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setId(UUID.randomUUID());
        refreshToken.setUser(user);
        refreshToken.setToken(refreshTokenValue);
        refreshToken.setExpiresAt(LocalDateTime.now().plusDays(jwtProperties.refreshTokenExpirationDays()));
        refreshToken.setRevoked(false);
        refreshToken.setCreatedAt(LocalDateTime.now());
        refreshTokenRepository.save(refreshToken);

        return new AuthResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                roles,
                accessToken,
                refreshTokenValue,
                user.getAccountCode()
        );
    }
}
