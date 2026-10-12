package com.clinic.identity.repository;

import com.clinic.identity.entity.User;
import com.clinic.identity.dto.DoctorNameResponse;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {
    @Query("select u from User u where lower(u.email) = lower(trim(:email))")
    Optional<User> findByEmail(String email);
    @Query("select (count(u) > 0) from User u where lower(u.email) = lower(trim(:email))")
    boolean existsByEmail(String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id")
    Optional<User> findLockedById(UUID id);

    @Query("select count(distinct u.id) from User u join u.roles r where r.code = com.clinic.identity.entity.RoleCode.ROLE_ADMIN and u.status = com.clinic.identity.entity.UserStatus.ACTIVE")
    long countActiveAdmins();

    /** Only accounts with the doctor role and active status may appear by name in booking. */
    @Query("select distinct new com.clinic.identity.dto.DoctorNameResponse(u.id, u.fullName) from User u join u.roles r where r.code = com.clinic.identity.entity.RoleCode.ROLE_DOCTOR and u.status = com.clinic.identity.entity.UserStatus.ACTIVE order by u.fullName asc, u.id asc")
    List<DoctorNameResponse> findActiveDoctorAccounts();
}
